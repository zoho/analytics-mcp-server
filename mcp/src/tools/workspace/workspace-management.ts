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
      2) Used when the user needs to select a workspace for further operations.
    </use_case>

    <important_notes>
      1) Avoid including shared workspaces unless specifically needed.
      2) If the workspace is not found among owned workspaces, try
         includeSharedWorkspaces = true to check shared workspaces.
    </important_notes>

    <returns>
      A list of workspace dictionaries, or an error message.
      When shared workspaces are not requested, the response is prefixed
      with "List of owned workspaces: ".
    </returns>
  `,
  args: {
    includeSharedWorkspaces: z
      .boolean()
      .optional()
      .describe("If true, includes shared workspaces in the list"),

    containsStr: z
      .string()
      .optional()
      .describe("Optional string to filter workspaces by a contains criterion"),
  },

  handler: async ({
    includeSharedWorkspaces = false,
    containsStr,
  }) => {
    try {
      const MAX_WORKSPACES = 20;
      const ac = getAnalyticsClient();
      if (!includeSharedWorkspaces) {
        const ownedWorkspaces = await ac.getOwnedWorkspaces();

        const result = filterAndLimitWorkspaces(
          ownedWorkspaces,
          containsStr,
          true,
          MAX_WORKSPACES
        );

        return ToolResponse(
          `List of owned workspaces: ${JSON.stringify(result)}`
        );
      }

      const allWorkspaces = await ac.getWorkspaces();
      const ownedWorkspaces = allWorkspaces.ownedWorkspaces || [];
      const sharedWorkspaces = allWorkspaces.sharedWorkspaces || [];

      const ownedResult = filterAndLimitWorkspaces(
        ownedWorkspaces,
        containsStr,
        true,
        MAX_WORKSPACES
      );

      const remainingCapacity = MAX_WORKSPACES - ownedResult.length;

      const sharedResult = filterAndLimitWorkspaces(
        sharedWorkspaces,
        containsStr,
        false,
        remainingCapacity
      );

      return ToolResponse(
        JSON.stringify([...ownedResult, ...sharedResult])
      );
    } catch (err) {
      return logAndReturnError(
        err,
        "An error occurred while fetching workspaces"
      );
    }
  },
});
