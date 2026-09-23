import { z } from "zod";
import { defineTool } from "../../tool-registry";
import { getAnalyticsClient, config } from "../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../utils/common";

// ---- Tool Registrations ----

defineTool({
  name: "createFolder",
  description: `
    Use Case:
    1) Creates a folder under a specified workspace to organize views (tables, reports, dashboards).
    2) Use this to organize workspace assets into folders for better structure and management.

    Important Notes:
    1) Folders support exactly 2 levels of nesting: a workspace can contain any number of root-level folders (level 1),
       and each root-level folder can contain any number of sub-folders (level 2).
    2) Sub-folders cannot contain further nested folders - only 1 level of sub-folders is supported.
    3) To create a sub-folder, provide parentFolderId (use getFolders to obtain the parent folder ID).
    4) Omit parentFolderId to create a root-level folder.
    5) After creating a folder, use moveViewsToFolder to organize existing views into it.

    Arguments:
    - workspaceId (str): The ID of the workspace where the folder will be created.
    - folderName (str): Required. Display name for the new folder.
    - folderDesc (str | optional): A brief description of the folder.
    - parentFolderId (str | optional): Only provide this to create a sub-folder. Use getFolders to obtain the parent folder ID.
      Note: only 1 level of sub-folders is supported, so the parent must be a root-level folder.
    - makeDefaultFolder (boolean | optional): Set to true to make this folder the default. Defaults to false.
    - orgId (str | optional): The ID of the organization. Defaults to config.ORGID if not provided.

    Returns:
    - A success message with the created folder ID.
    - An error message if the operation failed.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace where the folder will be created"),
    folderName: z.string().describe("Required. Display name for the new folder"),
    folderDesc: z.string().optional().describe("Optional. A brief description of the folder"),
    parentFolderId: z.string().optional().describe("Optional. Provide this to create a sub-folder (use getFolders to get parent folder ID). Only 1 level of sub-folders is supported"),
    makeDefaultFolder: z.boolean().optional().describe("Optional. Set to true to make this folder the default. Defaults to false"),
    orgId: z.string().optional().describe("The ID of the organization. Defaults to config.ORGID if not provided"),
  },
  handler: async ({ workspaceId, folderName, folderDesc, parentFolderId, makeDefaultFolder, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);

          const folderConfig: any = {};
          if (folderDesc) folderConfig.folderDesc = folderDesc;
          if (parentFolderId) folderConfig.parentFolderId = parentFolderId;
          if (makeDefaultFolder !== undefined) folderConfig.makeDefaultFolder = makeDefaultFolder;

          const folderId = await (workspaceInst as any).createFolder(folderName, folderConfig);
          return ToolResponse(`Folder '${folderName}' created successfully. Folder ID: ${folderId}`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while creating the folder");
    }
  },
});

defineTool({
  name: "deleteFolder",
  description: `
    Use Case:
    1) Deletes a folder from a workspace in Zoho Analytics.
    2) Use this to remove folders that are no longer needed.

    Important Notes:
    1) If the folder contains views (tables, reports, dashboards), you must move them out first using moveViewsToFolder.
    2) You cannot delete a folder that still contains views - the operation will fail.
    3) Use getFolders to list all folders and their IDs before deletion.

    Returns:
    - A success message if the folder was deleted.
    - An error message if the operation failed (e.g., folder contains views).
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the folder"),
    folderId: z.string().describe("The ID of the folder to delete"),
    orgId: z.string().optional().describe("The ID of the organization. Defaults to config.ORGID if not provided"),
  },
  handler: async ({ workspaceId, folderId, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
          await (workspaceInst as any).deleteFolder(folderId);
          return ToolResponse(`Folder '${folderId}' deleted successfully.`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while deleting the folder");
    }
  },
});

defineTool({
  name: "renameFolder",
  description: `
    Use Case:
    1) Renames an existing folder in a workspace.
    2) Use this to update folder names to better reflect their contents or purpose.

    Important Notes:
    1) Use getFolders to list all folders and their IDs before renaming.
    2) The folder ID remains the same; only the display name changes.

    Returns:
    - A success message if the folder was renamed.
    - An error message if the operation failed.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the folder"),
    folderId: z.string().describe("The ID of the folder to rename"),
    newFolderName: z.string().describe("The new name for the folder"),
    orgId: z.string().optional().describe("The ID of the organization. Defaults to config.ORGID if not provided"),
  },
  handler: async ({ workspaceId, folderId, newFolderName, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
          await (workspaceInst as any).renameFolder(folderId, newFolderName);
          return ToolResponse(`Folder '${folderId}' renamed to '${newFolderName}' successfully.`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while renaming the folder");
    }
  },
});

defineTool({
  name: "moveViewsToFolder",
  description: `
    Use Case:
    1) Moves one or more views (tables, reports, dashboards) into a specified folder within a workspace.
    2) Use this to organize views into folders for better workspace structure.

    Important Notes:
    1) Use getFolders to obtain the target folder ID.
    2) Use searchViews or getViewDetails to obtain view IDs.
    3) All views must belong to the same workspace as the target folder.
    4) You can move multiple views at once by providing a list of view IDs.

    Returns:
    - A success message if the views were moved.
    - An error message if the operation failed.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace containing the views and folder"),
    folderId: z.string().describe("The ID of the folder to move views into"),
    viewIds: z.array(z.string()).describe("Array of view IDs to move into the folder"),
    orgId: z.string().optional().describe("The ID of the organization. Defaults to config.ORGID if not provided"),
  },
  handler: async ({ workspaceId, folderId, viewIds, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
          await (workspaceInst as any).moveViewsToFolder(folderId, viewIds);
          return ToolResponse(`${viewIds.length} view(s) moved to folder '${folderId}' successfully.`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while moving views to the folder");
    }
  },
});


defineTool({
  name: "getFolders",
  description: `
    Use Case:
    1) List all folders in a specified workspace to discover the folder structure.
    2) Use this to get folder IDs before creating new views, moving views to folders, or when you need folder IDs for createFolder, moveViewsToFolder, or renameFolder operations.

    Important Notes:
    1) In Zoho Analytics, folders are used to organize views (tables, reports, dashboards) within a workspace.
    2) Returns folder metadata such as folder IDs, names, descriptions, default status, creator, and creation time.
    3) Folders support exactly 2 levels of nesting: a workspace can contain root-level folders (level 1), and each root-level folder can contain sub-folders (level 2).

    Returns:
    - A JSON array of folder objects.
    - An error message if the operation failed.
  `,
  args: {
    workspaceId: z.string().describe("The ID of the workspace to list folders from"),
    orgId: z
      .string()
      .optional()
      .describe("The ID of the organization. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }
      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const workspaceInst = ac.getWorkspaceInstance(org_id, workspace);
          const folders = await (workspaceInst as any).getFolders();

          if (!folders || folders.length === 0) {
            return ToolResponse("No folders found in this workspace.");
          }

          return ToolResponse(JSON.stringify(folders, null, 2));
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while fetching folders");
    }
  },
});
