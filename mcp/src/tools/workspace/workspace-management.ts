import { z } from "zod";
import { defineTool } from "../../tool-registry";
import { getAnalyticsClient, config } from "../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../utils/common";

// ---- Shared helpers ----

const filterAndLimitWorkspaces = (
  workspaces: any[],
  filter: string | undefined,
  isOwned: boolean,
  limit: number
) => {
  if (!workspaces || workspaces.length === 0) return [];
  let filtered = workspaces;
  if (filter) {
    filtered = workspaces.filter((w) =>
      w.workspaceName.toLowerCase().includes(filter.toLowerCase())
    );
  }
  if (filtered.length > limit) filtered = filtered.slice(0, limit);
  return filtered.map((w) => ({ ...w, owned: isOwned }));
};

// ---- Tool Registrations ----

defineTool({
  name: "createWorkspace",
  description: "Create a new workspace in Zoho Analytics with the given name",
  args: {
    workspaceName: z.string().describe("Name of the workspace to create"),
  },
  handler: async ({ workspaceName }) => {
    try {
      const ac = getAnalyticsClient();
      const org = ac.getOrgInstance(config.ORGID || "");
      const workspace_id = await org.createWorkspace(workspaceName, {});
      return ToolResponse(`Workspace '${workspaceName}' created successfully. Workspace Id: ${workspace_id}`);
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "errorCode" in err &&
        (err as { errorCode: number }).errorCode === 7101
      ) {
        return ToolResponse("Workspace name is already taken. Provide an alternate name.");
      }
      return logAndReturnError(err, "An error occurred while creating the workspace");
    }
  },
});

defineTool({
  name: "getWorkspaceList",
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
  args: {
    includeSharedWorkspaces: z
      .boolean()
      .describe("If True, includes shared workspaces in the list"),
    containsStr: z
      .string()
      .optional()
      .describe("Optional string to filter workspaces with a contains criteria"),
  },
  handler: async ({ includeSharedWorkspaces, containsStr }) => {
    try {
      const MAX_WORKSPACES = 20;
      const ac = getAnalyticsClient();
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
        return ToolResponse(JSON.stringify([...ownedResult, ...sharedResult]));
      }
    } catch (err) {
      return logAndReturnError(err, "An error occurred while fetching workspaces");
    }
  },
});
