import { z } from "zod";
import type { ServerInstance } from "../common";
import { getAnalyticsClient, config, stripProtocol } from '../utils/apiUtil';
import { retryWithFallback, ToolResponse, logAndReturnError } from "../utils/common";
import dedent from "dedent";
import * as dns from 'dns';
import * as https from 'https';
import { promisify } from 'util';
import * as os from 'os';
import * as net from 'net';
import * as tls from 'tls';

const dnsLookup = promisify(dns.lookup);
const dnsResolve = promisify(dns.resolve);


function httpsGet(hostname: string, path = '/'): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname, path, method: 'GET', timeout: 8000 },
      (res) => {
        res.resume(); // drain so the socket closes
        resolve(res.statusCode ?? 0);
      }
    );
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out after 8 s')); });
    req.on('error', reject);
    req.end();
  });
}

const filterAndLimitWorkspaces = (workspaces: any[], filter: string | undefined, isOwned: boolean, limit: number) => {
  if (!workspaces || workspaces.length === 0) {
    return [];
  }
  
  let filtered = workspaces;
  
  // Apply filter if provided
  if (filter) {
    filtered = workspaces.filter(workspace => 
      workspace.workspaceName.toLowerCase().includes(filter.toLowerCase())
    );
  }
  
  // Apply limit
  if (filtered.length > limit) {
    filtered = filtered.slice(0, limit);
  }
  
  // Add owned flag to each workspace
  return filtered.map(workspace => ({
    ...workspace,
    owned: isOwned
  }));
};

async function checkDns(hostname: string, label: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const { clean, hadProtocol } = stripProtocol(hostname);

  if (hadProtocol) {
    results.push(makeResult(
      `dns:protocol_check:${label}`, 'FAIL',
      `Hostname "${hostname}" still contains a protocol prefix after env-var check. ` +
      `DNS resolution will always fail for "https://..." strings. Using "${clean}" for remaining checks.`
    ));
  }

  // 1. dns.lookup  (uses the OS resolver - same path Node's https module takes)
  const t0 = Date.now();
  try {
    const addr = await dnsLookup(clean);
    results.push(makeResult(
      `dns:lookup:${label}`, 'PASS',
      `OS resolver resolved "${clean}" → ${JSON.stringify(addr)}`,
      Date.now() - t0
    ));
  } catch (err: any) {
    results.push(makeResult(
      `dns:lookup:${label}`, 'FAIL',
      `OS resolver (dns.lookup) failed for "${clean}": ${err.message} [code: ${err.code ?? 'unknown'}]. ` +
      `This is the same resolver Node's https module uses - check /etc/hosts, DNS servers, or network firewall rules.`,
      Date.now() - t0
    ));
  }

  // 2. dns.resolve (queries DNS directly, bypasses /etc/hosts)
  const t1 = Date.now();
  try {
    const addrs = await dnsResolve(clean);
    results.push(makeResult(
      `dns:resolve:${label}`, 'PASS',
      `DNS server resolved "${clean}" → [${addrs.join(', ')}]`,
      Date.now() - t1
    ));
  } catch (err: any) {
    results.push(makeResult(
      `dns:resolve:${label}`, 'FAIL',
      `DNS server query (dns.resolve) failed for "${clean}": ${err.message} [code: ${err.code ?? 'unknown'}]. ` +
      `If dns.lookup passed but this failed, the host exists in /etc/hosts but not in DNS - unusual in production.`,
      Date.now() - t1
    ));
  }

  return results;
}

function checkTls(hostname: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 5000 }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      socket.destroy();

      resolve(makeResult(
        `tls:${hostname}`, authorized ? 'PASS' : 'WARN',
        authorized
          ? `TLS handshake succeeded. Cert issued by: "${cert.issuer?.O}", valid until: ${cert.valid_to}.`
          : `TLS handshake completed but cert is not trusted: ${socket.authorizationError}. Possible SSL interception.`,
        Date.now() - t0
      ));
    });

    socket.on('error', (err: any) => {
      resolve(makeResult(
        `tls:${hostname}`, 'FAIL',
        `TLS connection to ${hostname} failed: ${err.message} [${err.code}]`,
        Date.now() - t0
      ));
    });
  });
}


async function checkHttpsReachability(hostname: string, label: string): Promise<CheckResult> {
  const { clean } = stripProtocol(hostname);
  const t0 = Date.now();
  try {
    const statusCode = await httpsGet(clean);
    // Any HTTP response (even 401/403/404) means TCP + TLS + HTTP are all working.
    const status = statusCode >= 200 && statusCode < 600 ? 'PASS' : 'WARN';
    return makeResult(
      `https:reachability:${label}`, status,
      `HTTPS GET to "${clean}" returned HTTP ${statusCode}. ` +
      (statusCode === 401 || statusCode === 403
        ? 'Auth error is expected at this stage - it confirms the host is reachable.'
        : statusCode === 404 ? 'Root path returned 404, which is normal for API hosts.'
        : ''),
      Date.now() - t0
    );
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    let hint = '';
    if (err.code === 'ENOTFOUND')   hint = 'DNS resolution failed inside httpsGet - the hostname could not be resolved.';
    if (err.code === 'ECONNREFUSED') hint = 'Connection refused - host is reachable via DNS but port 443 is blocked or not listening.';
    if (err.code === 'ETIMEDOUT')    hint = 'Connection timed out - host may be behind a firewall or network is slow.';
    if (err.message?.includes('timed out')) hint = 'Request timed out after 8 s.';
    return makeResult(
      `https:reachability:${label}`, 'FAIL',
      `HTTPS GET to "${clean}" failed: ${err.message} [code: ${err.code ?? 'unknown'}]. ${hint}`,
      durationMs
    );
  }
}

interface CheckResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  detail: string;
  durationMs?: number;
}

function makeResult(
  step: string,
  status: CheckResult['status'],
  detail: string,
  durationMs?: number
): CheckResult {
  return { step, status, detail, ...(durationMs !== undefined ? { durationMs } : {}) };
}

async function checkSdkApiCall(): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const analyticsClient = getAnalyticsClient();
    await analyticsClient.getOrgs();
    return makeResult(
      'sdk:api_call:getOrgs', 'PASS',
      'Successfully called analyticsClient.getOrgs() - OAuth token exchange and API round-trip both succeeded.',
      Date.now() - t0
    );
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    let hint = '';
    const msg: string = err?.errorMessage ?? err?.message ?? String(err);
    const code: string = String(err?.errorCode ?? err?.code ?? '');
    const lowerMsg = msg.toLowerCase();

    if (msg.includes('ENOTFOUND')) {
      hint = 'ENOTFOUND inside the SDK call - the AnalyticsClient is still receiving a hostname with a protocol prefix, or DNS is broken for that host at runtime.';
    } 
    else if (lowerMsg.includes('invalid_client_secret')) {
        hint = 'OAuth failure - invalid client secret. Please ensure that the ANALYTICS_CLIENT_SECRET variable is set correctly.';
    }
    else if (lowerMsg.includes('invalid_client')) {
      hint = 'OAuth failure - invalid client ID or client secret, or the accounts authorization URL is configured to the wrong DC.';
    }
    else if (lowerMsg.includes('invalid_code')) {
        hint = 'OAuth failure - invalid refresh token. Please ensure that the ANALYTICS_REFRESH_TOKEN variable is set correctly.';
    }
    else if (code === '8535' || msg.toLowerCase().includes('invalid token') || msg.toLowerCase().includes('oauth'))
      hint = 'OAuth failure - check CLIENTID, CLIENTSECRET, and REFRESHTOKEN values.';
    else if (msg.toLowerCase().includes('econnrefused'))
      hint = 'Connection refused - the analytics API host is not reachable on port 443 from this machine.';

    return makeResult(
      'sdk:api_call:getOrgs', 'FAIL',
      `analyticsClient.getOrgs() threw: ${msg} [code: ${code}]. ${hint}`,
      durationMs
    );
  }
}


async function checkEnvVars(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const vars: Array<{ key: string; value: string | undefined; label: string }> = [
    { key: 'ANALYTICS_CLIENT_ID',     value: config.CLIENTID,       label: 'CLIENTID'       },
    { key: 'ANALYTICS_CLIENT_SECRET', value: config.CLIENTSECRET,   label: 'CLIENTSECRET'   },
    { key: 'ANALYTICS_REFRESH_TOKEN', value: config.REFRESHTOKEN,   label: 'REFRESHTOKEN'   },
    { key: 'ANALYTICS_ORG_ID',        value: config.ORGID,          label: 'ORGID'          },
    { key: 'ACCOUNTS_SERVER_URL',     value: process.env.ACCOUNTS_SERVER_URL,  label: 'ACCOUNTS_SERVER_URL'  },
    { key: 'ANALYTICS_SERVER_URL',    value: process.env.ANALYTICS_SERVER_URL, label: 'ANALYTICS_SERVER_URL' },
  ];

  for (const v of vars) {
    if (!v.value) {
      results.push(makeResult(
        `env:${v.key}`, 'FAIL',
        `${v.key} is not set or empty.`
      ));
      continue;
    }

    const { hadProtocol, clean } = stripProtocol(v.value);

    // URL vars should be bare hostnames - flag if they contain a protocol
    const isUrlVar = v.key.endsWith('_URL');
    if (isUrlVar && hadProtocol) {
      results.push(makeResult(
        `env:${v.key}`, 'FAIL',
        `${v.key} contains a protocol prefix ("${v.value}"). ` +
        `It must be a bare hostname without "https://". Suggested fix: "${clean}"`
      ));
    } else if (isUrlVar && v.value.endsWith('/')) {
      results.push(makeResult(
        `env:${v.key}`, 'WARN',
        `${v.key} has a trailing slash ("${v.value}"). This may cause double-slash issues. Suggested fix: "${clean}"`
      ));
    } else {
      const masked = isUrlVar ? v.value : `${v.value.slice(0, 2)}${'*'.repeat(Math.max(0, v.value.length - 4))}`;
      results.push(makeResult(
        `env:${v.key}`, 'PASS',
        `${v.key} is set. Value: ${masked}`
      ));
    }
  }
  return results;
}

async function checkProxyEnv(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const proxyVars = [
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
    'http_proxy', 'https_proxy', 'no_proxy',
  ];

  for (const key of proxyVars) {
    const val = process.env[key];
    if (!val) {
      results.push(makeResult(`env:proxy:${key}`, 'SKIP', `${key} is not set.`));
      continue;
    }

    // Extract only the hostname - never log credentials or full URL
    let safeRepresentation: string;
    try {
      const parsed = new URL(val.startsWith('http') ? val : `http://${val}`);
      const hasCredentials = !!(parsed.username || parsed.password);
      safeRepresentation = `host=${parsed.hostname}, port=${parsed.port || '(default)'}, hasCredentials=${hasCredentials}`;
    } catch {
      safeRepresentation = '(unparseable value - not logged for safety)';
    }

    results.push(makeResult(
      `env:proxy:${key}`, 'WARN',
      `${key} is set [${safeRepresentation}]. If this proxy is not reachable from the MCP server process, ` +
      `outbound HTTPS calls will fail even if DNS is healthy.`
    ));
  }

  return results;
}

function checkDnsServers(): CheckResult {
  const servers = dns.getServers(); // returns string[] of IPs
  return makeResult(
    'dns:servers', 'PASS',
    `DNS servers in use: [${servers.join(', ')}]`
  );
}

function checkRuntimeContext(): CheckResult {
  const pathEntryCount = (process.env.PATH ?? '').split(
    process.platform === 'win32' ? ';' : ':'
  ).filter(Boolean).length;

  // Redact full shell path - only keep the binary name (e.g. "bash", "zsh")
  const rawShell = process.env.SHELL ?? process.env.COMSPEC ?? '';
  const shellName = rawShell ? rawShell.split(/[\\/]/).pop() : 'unknown';

  return makeResult(
    'runtime:context', 'PASS',
    `Platform: ${process.platform}, Arch: ${process.arch}, ` +
    `Node: ${process.version}, OS: ${os.type()} ${os.release()}, ` +
    `Shell: ${shellName}, PATH entries: ${pathEntryCount}`
  );
}

function checkTcpPort(hostname: string, port = 443): Promise<CheckResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(port, hostname, () => {
      socket.destroy();
      resolve(makeResult(
        `tcp:${hostname}:${port}`, 'PASS',
        `TCP connection to ${hostname}:${port} succeeded.`,
        Date.now() - t0
      ));
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(makeResult(
        `tcp:${hostname}:${port}`, 'FAIL',
        `TCP connection to ${hostname}:${port} timed out after 5s — port 443 may be firewalled.`,
        Date.now() - t0
      ));
    });

    socket.on('error', (err: any) => {
      resolve(makeResult(
        `tcp:${hostname}:${port}`, 'FAIL',
        `TCP connection to ${hostname}:${port} failed: ${err.message} [${err.code}]`,
        Date.now() - t0
      ));
    });
  });
}

const VIEW_RESULT_LIMIT = 100;

type View = {
  viewId: string;
  viewName: string;
  viewDesc?: string;
  [key: string]: any;
};

type GetViewsConfig = {
  viewTypes: number[];
  noOfResult?: number;
  sortedOrder?: number;
  sortedColumn?: number;
  startIndex?: number;
  keyword?: string;
};


async function getViews(
        org_id: string,
        workspace_id: string,
        allowed_view_types_ids: number[] = [0, 6],
        containsStr?: string,
        fromRelevantViewsTool = false
      ): Promise<View[] | string> {
        const analyticsClient = getAnalyticsClient();
        const workspace = analyticsClient.getWorkspaceInstance(org_id, workspace_id);
        allowed_view_types_ids = filterValidNumbers(allowed_view_types_ids,[0,2,3,4,6,7])
        let conf: GetViewsConfig = fromRelevantViewsTool
          ? { viewTypes: allowed_view_types_ids }
          : {
              viewTypes: allowed_view_types_ids,
              noOfResult: VIEW_RESULT_LIMIT + 1,
              sortedOrder: 0,
              sortedColumn: 0,
              startIndex: 1,
            };

        if (containsStr) {
          conf.keyword = containsStr;
        }

        const viewList = await workspace.getViews(conf);

        if (!viewList || (Array.isArray(viewList) && viewList.length === 0)) {
          return "No views found";
        }

        if (!fromRelevantViewsTool && Array.isArray(viewList) && viewList.length > VIEW_RESULT_LIMIT) {
          return `Too many views found. Please refine your search criteria to use viewContainsStr parameter to filter views if view name is provided.
(or)
Use the searchViews() tool with a natural language query to get relevant views based on user query.`;
        }

        return viewList;
      }


function filterValidNumbers(input: number[], validNumbers: number[]): number[] {
  const validSet = new Set(validNumbers); // faster lookup than array.includes
  return input.filter(num => validSet.has(num));
}

export function registerMetaDataTools(server: ServerInstance) {

  server.registerTool("getWorkspacesList",
    {
      description: `
      <use_case>
        1) Fetches the list of workspaces in the user's organization.
        2) Used in the scenario where the user needs to select a workspace for further operations.
      </use_case>

      <important_notes>
        1) Try to avoid setting includeSharedWorkspaces to True unless you specifically need to see shared workspaces.
        2) If you don't find a workspace from the owned workspaces, try setting includeSharedWorkspaces to True to see if the workspace is shared with you.
      </important_notes>

      <returns>
        A list of dictionaries, each representing a workspace with its details.
        If an error occurs, returns an error message.
      </returns>
      `,
      inputSchema: {
        includeSharedWorkspaces: z.boolean().describe("If True, includes shared workspaces in the list"),
        containsStr: z.string().optional().describe("Optional string to filter workspaces with a contains criteria")
      },
      annotations: {
        title: "Get Workspaces List",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async ({ includeSharedWorkspaces, containsStr }) => {
      try {
        const MAX_WORKSPACES = 20;
        var ac = getAnalyticsClient();
        let allWorkspaces;
        if (!includeSharedWorkspaces) {
          const ownedWorkspaces = await ac.getOwnedWorkspaces();
          const result = filterAndLimitWorkspaces(ownedWorkspaces, containsStr, true, MAX_WORKSPACES);
          return ToolResponse(JSON.stringify(result));
        } else {
          const allWorkspaces = await ac.getWorkspaces();
          const ownedWorkspaces = allWorkspaces.ownedWorkspaces || [];
          const sharedWorkspaces = allWorkspaces.sharedWorkspaces || [];
          const ownedResult = filterAndLimitWorkspaces(ownedWorkspaces, containsStr, true, MAX_WORKSPACES);
          const remainingCapacity = MAX_WORKSPACES - ownedResult.length;
          const sharedResult = filterAndLimitWorkspaces(sharedWorkspaces, containsStr, false, remainingCapacity);
          const combinedResult = [...ownedResult, ...sharedResult];
          return ToolResponse(JSON.stringify(combinedResult));
        }
      } catch (err) {
        return logAndReturnError(err, "An error occurred while fetching workspaces");
      }
  });

  server.registerTool("getViewDetails",
  {
      description: `
      <use_case>
          1) Fetches the details of a specific view in a workspace.
          2) Use this when you need detailed information about a specific view, such as its structure, data, and properties. (In case of a table, it will return the columns and their data types, dashboards will return the charts and their properties, etc.)
      </use_case>

      <returns>
          A dictionary containing the details of the specified view.
          If an error occurs, returns an error message.
      </returns>
      `,
      inputSchema: {
          viewId: z.string().describe("The ID of the view for which to fetch details")
      },
      annotations: {
        title: "Get View Details",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
  },
  async ({ viewId }) => {
      try {
          const analyticsClient = getAnalyticsClient();
          let viewDetails = await analyticsClient.getViewDetails(viewId, { withInvolvedMetaInfo: true });
          if (viewDetails) {
              if ('orgId' in viewDetails) {
                  delete (viewDetails as any).orgId;
              }
              
              if ('createdByZuId' in viewDetails) {
                  delete (viewDetails as any).createdByZuId;
              }
              
              if ('lastDesignModifiedByZuId' in viewDetails) {
                  delete (viewDetails as any).lastDesignModifiedByZuId;
              }
              
              // Clean column details if they exist
              if ('columns' in viewDetails && Array.isArray(viewDetails.columns)) {
                  viewDetails.columns = (viewDetails as any).columns.map((column: any) => {
                      const columnCopy = {...column};
                      delete (columnCopy as any).dataTypeId;
                      delete (columnCopy as any).columnIndex;
                      delete (columnCopy as any).pkTableName;
                      delete (columnCopy as any).pkColumnName;
                      delete (columnCopy as any).formulaDisplayName;
                      delete (columnCopy as any).defaultValue;
                      return columnCopy;
                  });
              }
          }
          return ToolResponse(`Retrieved details for view ID: ${viewId}\n${JSON.stringify(viewDetails)}`);
      } catch (err) {
          return logAndReturnError(err, "An error occurred while fetching view details");
      }
  }
  );

  server.registerTool("searchViews",
  {
    description: `
    use_case:
    1) Searches for views in a workspace using either contains string name matching or natural language query via Retrieval-Augmented Generation (RAG).
    2) Use this when you need to find specific views or views relevant to a question.
    
    important_notes:
    - If viewContainsStr is provided, performs simple string matching on view names.
    - If viewContainsStr is None and naturalLanguageQuery is provided, performs intelligent RAG-based search using natural language.
    - If both viewContainsStr and naturalLanguageQuery are provided, viewContainsStr takes precedence and RAG search is not performed.
    - If both are None, returns views without filtering (may error if too many).
    - If not specified explicitly, uses [0, 6] as default value for allowedViewTypesIds (Table and Query Table).
    
     arguments:
     - workspaceId: The ID of the workspace to search in.
     - naturalLanguageQuery: Natural language query for intelligent search. Ignored if viewContainsStr is provided.
     - viewContainsStr: String to filter views by name matching. Takes precedence over naturalLanguageQuery.
     - allowedViewTypesIds: Optional array of view type IDs to filter results. It should be an array of integers. Different types of views available in zoho analytics are:
      (view type_id, view_type_name)
      0 - Table: A standard table
      2 - Chart: A graphical representation of data
      3 - Pivot Table: A table that summarizes data in a multidimensional format
      4 - Summary View: A view that provides a simple tabular summary of your data with aggregate functions applied
      6 - Query Table: A derived table created from a custom SQL query
      7 - Dashboard: A collection of visualizations and reports
    - orgId: Organization ID. Defaults to config value if not provided.

    returns:
    - A JSON stringified array of views matching the criteria or an error message string.
    `,
       inputSchema: {
       workspaceId: z.string(),
       naturalLanguageQuery: z.string().optional(),
       viewContainsStr: z.string().optional(),
       allowedViewTypesIds: z.array(z.number()).optional(),
       orgId: z.string().nullable().optional(),
     },
    annotations: {
      title: "Search Views",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
   async ({ workspaceId, naturalLanguageQuery, viewContainsStr, allowedViewTypesIds, orgId }) => {
     try {
       if (!orgId) {
         orgId = config.ORGID || "";
       }

       return await retryWithFallback([orgId], workspaceId, "WORKSPACE", async (org_id, workspace, natLangQuery, view_str, allowed_view_types_ids) => {
         if (
           (view_str && view_str.trim() !== "") ||
           !natLangQuery ||
           natLangQuery.trim() === ""
           ) {
           const views = await getViews(org_id, workspace, allowed_view_types_ids ?? [0, 6], view_str, false);
           return ToolResponse(typeof views === "string" ? views : JSON.stringify(views));
         }

         // RAG search path
         const initialViews = await getViews(org_id, workspace, allowed_view_types_ids ?? [0,6], undefined, true);

        if (typeof initialViews === "string" || !Array.isArray(initialViews) || initialViews.length === 0) {
          return ToolResponse("No views found in the workspace.");
        }


        const viewIdToDetails: Record<string, View> = {};
        const transformedViewList: View[] = [];

        initialViews.forEach((view) => {
          const filteredView: View = {
            viewId: view.viewId,
            viewName: view.viewName,
            viewDesc: view.viewDesc ?? "",
          };
          transformedViewList.push(filteredView);
          viewIdToDetails[view.viewId] = filteredView;
        });

        let currentViewList = transformedViewList;
        const batchSize = 15;
        const maxEpochs = 5;
        let epoch = 1;
        let sampleSupported = true;

      while (currentViewList.length > 15 && epoch <= maxEpochs && sampleSupported) {
        console.error(`Starting Epoch ${epoch} with ${currentViewList.length} views`);

        const filteredViewList: View[] = [];
        const numberOfBatches = Math.ceil(currentViewList.length / batchSize);

        for (let batchNumber = 0; batchNumber < numberOfBatches; batchNumber++) {
          const viewsInBatch = currentViewList.slice(batchNumber * batchSize, (batchNumber + 1) * batchSize);

          const prompt = `
You are an expert at identifying and ranking relevant views (tables, reports, dashboards) based on natural language queries.

EPOCH ${epoch} - BATCH ${batchNumber + 1}/${numberOfBatches}
Current views number in this epoch: ${currentViewList.length}
Views number in this batch: ${viewsInBatch.length}

Your task: Analyze the following views and rank them by relevance to the query. Return the TOP 5 MOST RELEVANT views from this batch based on your ranking.

Views in this batch:
${JSON.stringify(viewsInBatch)}

Natural language query: \`${natLangQuery}\`

Instructions:
1. Rank ALL views in this batch by relevance to the query
2. Select the TOP 5 most relevant views based on your ranking
3. If there are fewer than 5 views in the batch, return only the relevant views from them
4. Consider view names, descriptions, and how well they match the query intent
5. The output provided should be a properly escaped JSON and should not contain other formatting characters like new lines.

Strictly provide your output in the following JSON format:
{"relevant_views":[<list-of-top-5-view-ids-in-order-of-relevance>]}
`;

          try {
            const response = await server.server.createMessage({
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: prompt,
                  },
                },
              ],
              maxTokens: 500,
            });

            if (response.content.type !== "text") {
              return ToolResponse("Error in processing the RAG response. Please try again.");
            }

            console.error(
              JSON.stringify(
                {
                  epoch,
                  batch: batchNumber + 1,
                  prompt,
                  response: response.text,
                },
                null,
                2
              )
            );

            const responseJson = JSON.parse(response.content.text);
            if (Array.isArray(responseJson.relevant_views)) {
              responseJson.relevant_views.forEach((viewId: string) => {
                if (viewIdToDetails[viewId]) {
                  filteredViewList.push(viewIdToDetails[viewId]);
                }
              });
            }
          } catch (e) {
            console.error(`Error during sampling: ${(e as Error).message || e}`);
            if (batchNumber === 0 && epoch === 1) {
              console.error("Sampling is not supported in this environment");
              sampleSupported = false;
              break;
            }
            break;
          }
        }

        if (!sampleSupported) {
          break;
        }

        console.error(`Epoch ${epoch} completed. Reduced from ${currentViewList.length} to ${filteredViewList.length} views`);
        currentViewList = filteredViewList;
        epoch++;
      }

      if (!sampleSupported) {
        console.error("Using fallback mechanism: Returning first 20 views from the workspace");
        return ToolResponse(JSON.stringify(transformedViewList.slice(0, 20)));
      }

      console.error(`Final result: ${currentViewList.length} views after ${epoch - 1} epochs`);
        return ToolResponse(JSON.stringify(currentViewList));
        }, workspaceId, naturalLanguageQuery, viewContainsStr, allowedViewTypesIds);
    } catch (error) {
      return logAndReturnError(error, `Error in searchViews: ${(error as Error).message || error}`);
    }
  });


  server.registerTool(
    'checkConnection',
    {
      description: `
        This tool performs a comprehensive, step-by-step health check of the Zoho Analytics MCP Server. Use this tool to diagnose issues such as configuration, network connectivity, misconfigured environment variables, DNS failures or OAuth problems before making real API calls.
      
        It returns a verbose, structured report with a PASS / FAIL / WARN status per step,
        timing information, and actionable hints for any failures.
      `,
      inputSchema: {},
      annotations: {
        title: 'Check Connection & SDK Health',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const allResults: CheckResult[] = [];
      const overallStart = Date.now();

      // ── Step 1: environment variables ──────────────────────────────────────
      allResults.push(...await checkEnvVars());

      allResults.push(...await checkProxyEnv());

      allResults.push(checkDnsServers());

      // Determine cleaned hostnames for subsequent checks.
      const accountsRaw  = process.env.ACCOUNTS_SERVER_URL  ?? '';
      const analyticsRaw = process.env.ANALYTICS_SERVER_URL ?? '';
      const accountsHost  = stripProtocol(accountsRaw).clean  || 'accounts.zoho.com';
      const analyticsHost = stripProtocol(analyticsRaw).clean || 'analyticsapi.zoho.com';

      // ── Step 2 & 3: DNS checks ─────────────────────────────────────────────
      if (accountsRaw) {
        allResults.push(...await checkDns(accountsHost, 'ACCOUNTS_SERVER_URL'));
      } else {
        allResults.push(makeResult('dns:ACCOUNTS_SERVER_URL', 'SKIP', 'ACCOUNTS_SERVER_URL not set; skipping DNS check.'));
      }

      if (analyticsRaw) {
        allResults.push(...await checkDns(analyticsHost, 'ANALYTICS_SERVER_URL'));
      } else {
        allResults.push(makeResult('dns:ANALYTICS_SERVER_URL', 'SKIP', 'ANALYTICS_SERVER_URL not set; skipping DNS check.'));
      }

      allResults.push(await checkTcpPort(accountsHost));
      allResults.push(await checkTls(accountsHost));

      // ── Step 4: HTTPS reachability ─────────────────────────────────────────
      allResults.push(await checkHttpsReachability(accountsHost,  'ACCOUNTS_SERVER_URL'));
      allResults.push(await checkHttpsReachability(analyticsHost, 'ANALYTICS_SERVER_URL'));

      // ── Step 5: Live SDK call ──────────────────────────────────────────────
      allResults.push(await checkSdkApiCall());

      allResults.push(checkRuntimeContext());

      // ── Summary ────────────────────────────────────────────────────────────
      const totalMs   = Date.now() - overallStart;
      const failCount = allResults.filter(r => r.status === 'FAIL').length;
      const warnCount = allResults.filter(r => r.status === 'WARN').length;
      const passCount = allResults.filter(r => r.status === 'PASS').length;
      const skipCount = allResults.filter(r => r.status === 'SKIP').length;

      const summary = {
        overallStatus : failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS',
        totalChecks   : allResults.length,
        passed        : passCount,
        failed        : failCount,
        warned        : warnCount,
        skipped       : skipCount,
        totalDurationMs: totalMs,
      };

      const report = { summary, checks: allResults };
      return ToolResponse(JSON.stringify(report, null, 2));
    }
  );

}
