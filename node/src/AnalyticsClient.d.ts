/*$Id$*/

/**
 * Type definitions for Zoho Analytics Client
 */

declare module './AnalyticsClient' {
    /**
     * Represents a JSON array structure returned by the API
     */
    type JSONArray = any[];

    /**
     * Configuration object for API requests
     */
    interface Config {
        [key: string]: any;
    }

    class AnalyticsClient {
        clientId: string;
        clientSecret: string;
        refreshToken: string;
        accessToken: string | null;

        constructor(clientId: string, clientSecret: string, refreshToken: string, analyticsURI?: string, accountsURI?: string);

        /**
         * Returns list of all accessible organizations.
         * @returns {Promise<JSONArray>} Organization list.
         * @throws {Error} If the request failed due to some error.
         */
        getOrgs(): Promise<JSONArray>;

        /**
         * Returns list of all accessible workspaces.
         * @returns {Promise<{ownedWorkspaces: JSONArray, sharedWorkspaces: JSONArray}>} Workspace object containing ownedWorkspaces and sharedWorkspaces.
         * @throws {Error} If the request failed due to some error.
         */
        getWorkspaces(): Promise<{ownedWorkspaces: JSONArray, sharedWorkspaces: JSONArray}>;
        
        /**
         * Returns list of owned workspaces.
         * @returns {Promise<JSONArray>} Workspace list.
         * @throws {Error} If the request failed due to some error.
         */
        getOwnedWorkspaces(): Promise<JSONArray>;
        
        /**
         * Returns list of shared workspaces.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<JSONArray>} Workspace list.
         * @throws {Error} If the request failed due to some error.
         */
        getSharedWorkspaces(config?: Config): Promise<JSONArray>;

        /**
         * Returns list of recently accessed views.
         * @returns {Promise<JSONArray>} View list.
         * @throws {Error} If the request failed due to some error.
         */
        getRecentViews(): Promise<JSONArray>;

        /**
         * Returns list of all accessible dashboards.
         * @returns {Promise<JSONArray>} Dashboard list.
         * @throws {Error} If the request failed due to some error.
         */
        getDashboards(): Promise<JSONArray>;

        /**
         * Returns list of owned dashboards.
         * @returns {Promise<JSONArray>} Dashboard list.
         * @throws {Error} If the request failed due to some error.
         */
        getOwnedDashboards(): Promise<JSONArray>;

        /**
         * Returns list of shared dashboards.
         * @returns {Promise<JSONArray>} Dashboard list.
         * @throws {Error} If the request failed due to some error.
         */
        getSharedDashboards(): Promise<JSONArray>;

        /**
         * Returns details of the specified workspace.
         * @param {string} workspaceId - The ID of the workspace.
         * @returns {Promise<Object>} Workspace details.
         * @throws {Error} If the request failed due to some error.
         */
        getWorkspaceDetails(workspaceId: string): Promise<Object>;

        /**
         * Returns details of the specified view.
         * @param {string} viewId - The ID of the view.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<Object>} View details.
         * @throws {Error} If the request failed due to some error.
         */
        getViewDetails(viewId: string, config?: Config): Promise<Object>;

        /**
         * Returns a new OrgAPI instance.
         * @param {string} orgId - The ID of the organization.
         * @returns {OrgAPI} An instance of OrgAPI.
         */
        getOrgInstance(orgId: string): OrgAPI;
        
        /**
         * Returns a new WorkspaceAPI instance.
         * @param {string} orgId - The ID of the organization.
         * @param {string} workspaceId - The ID of the workspace.
         * @returns {WorkspaceAPI} An instance of WorkspaceAPI.
         */
        getWorkspaceInstance(orgId: string, workspaceId: string): WorkspaceAPI;

        /**
         * Returns a new ViewAPI instance.
         * @param {string} orgId - The ID of the organization.
         * @param {string} workspaceId - The ID of the workspace.
         * @param {string} viewId - The ID of the view.
         * @returns {ViewAPI} An instance of ViewAPI.
         */
        getViewInstance(orgId: string, workspaceId: string, viewId: string): ViewAPI;

        /**
         * Returns a new BulkAPI instance.
         * @param {string} orgId - The ID of the organization.
         * @param {string} workspaceId - The ID of the workspace.
         * @returns {BulkAPI} An instance of BulkAPI.
         */
        getBulkInstance(orgId: string | undefined, workspaceId: string): BulkAPI;

        /**
         * Utility method to create a delay
         * @param {number} ms - The number of milliseconds to sleep
         * @returns {Promise<void>} A promise that resolves after the specified time
         */
        sleep(ms: number): Promise<void>;

        /**
         * Handles batch import requests
         * @param {string} uriPath - The URI path for the request
         * @param {Config} config - Configuration options
         * @param {object} header - Request headers
         * @param {string} filePath - Path to the file to import
         * @param {number} batchSize - Size of each batch
         * @returns {Promise<string>} Job ID of the import operation
         */
        handleBatchImportRequest(uriPath: string, config: Config, header: object, filePath: string, batchSize: number): Promise<string>;

        /**
         * Sends a batch import request
         * @param {string} url - The URL for the request
         * @param {object} header - Request headers
         * @param {string} batch - Batch data to send
         * @returns {Promise<any>} Promise with the response data
         */
        sendBatchImportRequest(url: string, header: object, batch: string): Promise<any>;

        /**
         * Handles import requests
         * @param {string} uriPath - The URI path for the request
         * @param {Config} config - Configuration options
         * @param {object} header - Request headers
         * @param {string} filePath - Path to the file to import
         * @param {any} data - Data to import
         * @returns {Promise<any>} Promise with the response data
         */
        handleImportRequest(uriPath: string, config: Config, header: object, filePath: string, data?: any): Promise<any>;

        /**
         * Sends an import request
         * @param {string} uriPath - The URI path for the request
         * @param {Config} config - Configuration options
         * @param {object} header - Request headers
         * @param {string} filePath - Path to the file to import
         * @param {any} data - Data to import
         * @returns {Promise<any>} Promise with the response data
         */
        sendImportRequest(uriPath: string, config: Config, header: object, filePath: string, data: any): Promise<any>;

        /**
         * Handles export requests
         * @param {string} uriPath - The URI path for the request
         * @param {string} filePath - Path where the file will be exported
         * @param {Config} config - Configuration options
         * @param {object} header - Request headers
         * @returns {Promise<any>} Promise with the response data
         */
        handleExportRequest(uriPath: string, filePath: string, config: Config, header: object): Promise<any>;

        /**
         * Sends an export request
         * @param {string} uriPath - The URI path for the request
         * @param {string} filePath - Path where the file will be exported
         * @param {Config} config - Configuration options
         * @param {object} header - Request headers
         * @returns {Promise<void>} Promise that resolves when export is complete
         */
        sendExportRequest(uriPath: string, filePath: string, config: Config, header: object): Promise<void>;

        /**
         * Handles v2 API requests
         * @param {string} uriPath - The URI path for the request
         * @param {string} method - HTTP method (GET, POST, etc.)
         * @param {Config} config - Configuration options
         * @param {object} header - Request headers
         * @param {boolean} isExportReq - Whether this is an export request
         * @returns {Promise<any>} Promise with the response data
         */
        handleV2Request(uriPath: string, method: string, config: Config, header: object, isExportReq?: boolean): Promise<any>;

        /**
         * Sends a v2 API request
         * @param {string} uriPath - The URI path for the request
         * @param {string} reqMethod - HTTP method (GET, POST, etc.)
         * @param {Config} config - Configuration options
         * @param {object} header - Request headers
         * @param {boolean} isExportReq - Whether this is an export request
         * @returns {Promise<any>} Promise with the response data
         */
        sendV2Request(uriPath: string, reqMethod: string, config: Config, header: object, isExportReq?: boolean): Promise<any>;
        
        /**
         * Gets an OAuth token
         * @returns {Promise<string>} Promise with the access token
         */
        getOauth(): Promise<string>;
    }

    class OrgAPI {
        /**
         * Constructs an OrgAPI instance
         * @param {AnalyticsClient} ac - The analytics client instance
         * @param {string} orgId - The organization ID
         */
        constructor(ac: AnalyticsClient, orgId: string);

        /**
         * Create a blank workspace in the specified organization.
         * @param {string} workspaceName - Name of the workspace.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Created workspace id.
         * @throws {Error} If the request failed due to some error.
         */
        createWorkspace(workspaceName: string, config?: Config): Promise<string>;

        /**
         * Returns list of admins for a specified organization.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<JSONArray>} Organization admin list.
         * @throws {Error} If the request failed due to some error.
         */
        getAdmins(config?: Config): Promise<JSONArray>;

        /**
         * Returns subscription details of the specified organization.
         * @returns {Promise<Object>} Subscription details.
         * @throws {Error} If the request failed due to some error.
         */
        getSubscriptionDetails(): Promise<Object>;

        /**
         * Returns resource usage details of the specified organization.
         * @returns {Promise<Object>} Resource details.
         * @throws {Error} If the request failed due to some error.
         */
        getResourceDetails(): Promise<Object>;

        /**
         * Returns list of users for the specified organization.
         * @returns {Promise<JSONArray>} User list.
         * @throws {Error} If the request failed due to some error.
         */
        getUsers(): Promise<JSONArray>;

        /**
         * Add users to the specified organization.
         * @param {JSONArray} emailIds - The email address of the users to be added.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        addUsers(emailIds: JSONArray, config?: Config): Promise<void>;

        /**
         * Remove users from the specified organization.
         * @param {JSONArray} emailIds - The email address of the users to be removed.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        removeUsers(emailIds: JSONArray, config?: Config): Promise<void>;

        /**
         * Activate users in the specified organization.
         * @param {JSONArray} emailIds - The email address of the users to be activated.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        activateUsers(emailIds: JSONArray, config?: Config): Promise<void>;

        /**
         * Deactivate users in the specified organization.
         * @param {JSONArray} emailIds - The email address of the users to be deactivated.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        deActivateUsers(emailIds: JSONArray, config?: Config): Promise<void>;

        /**
         * Change role for the specified users.
         * @param {JSONArray} emailIds - The email address of the users.
         * @param {string} role - New role for the users.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        changeUserRole(emailIds: JSONArray, role: string, config?: Config): Promise<void>;

        /**
         * Returns details of the specified workspace/view.
         * @param {string} workspaceName - Name of the workspace.
         * @param {string} [viewName] - Name of the view. Can be null.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<Object>} Workspace (or) View meta details.
         * @throws {Error} If the request failed due to some error.
         */
        getMetaDetails(workspaceName: string, viewName?: string | null, config?: Config): Promise<Object>;
    }

    class WorkspaceAPI {
        /**
         * Constructs a WorkspaceAPI instance
         * @param {AnalyticsClient} ac - The analytics client instance
         * @param {string} orgId - The organization ID
         * @param {string} workspaceId - The workspace ID
         */
        constructor(ac: AnalyticsClient, orgId: string, workspaceId: string);

        /**
         * Copy the specified workspace from one organization to another or within the organization.
         * @param {string} workspaceName - Name of the new workspace.
         * @param {Config} [config] - Contains any additional control attributes.
         * @param {string} [destOrgId] - Id of the organization where the destination workspace is present.
         * @returns {Promise<string>} Copied workspace id.
         * @throws {Error} If the request failed due to some error.
         */
        copy(workspaceName: string, config?: Config, destOrgId?: string): Promise<string>;

        /**
         * Rename a specified workspace in the organization.
         * @param {string} workspaceName - New name for the workspace.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        rename(workspaceName: string, config?: Config): Promise<void>;

        /**
         * Delete a specified workspace in the organization.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        delete(config?: Config): Promise<void>;

        /**
         * Create a table in the specified workspace.
         * @param {Object} tableDesign - Table structure.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} created table id.
         * @throws {Error} If the request failed due to some error.
         */
        createTable(tableDesign: Object, config?: Config): Promise<string>;

        /**
         * Create a new query table in the workspace.
         * @param {string} sqlQuery - SQL query to construct the query table.
         * @param {string} queryTableName - Name of the query table to be created.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Id of the created query table.
         * @throws {Error} If the request failed due to some error.
         */
        createQueryTable(sqlQuery: string, queryTableName: string, config?: Config): Promise<string>;

        /**
         * Update the mentioned query table in the workspace.
         * @param {string} viewId - Id of the query table to be updated.
         * @param {string} sqlQuery - New SQL query to be updated.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        editQueryTable(viewId: string, sqlQuery: string, config?: Config): Promise<void>;

        /**
         * Returns the secret key of the specified workspace.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Workspace secret key.
         * @throws {Error} If the request failed due to some error.
         */
        getSecretKey(config?: Config): Promise<string>;

        /**
         * Adds a specified workspace as favorite.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        addFavorite(config?: Config): Promise<void>;

        /**
         * Remove a specified workspace from favorite.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        removeFavorite(config?: Config): Promise<void>;

        /**
         * Adds a specified workspace as default.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        addDefault(config?: Config): Promise<void>;

        /**
         * Remove a specified workspace from default.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        removeDefault(config?: Config): Promise<void>;

        /**
         * Returns list of admins for the specified workspace.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<JSONArray>} Workspace admin list.
         * @throws {Error} If the request failed due to some error.
         */
        getAdmins(config?: Config): Promise<JSONArray>;

        getViews(config?: Config): Promise<JSONArray>;

        createReport(config?: Config): Promise<JSONArray>;

        /**
         * Returns list of all aggregate formulas for the specified workspace.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<JSONArray>} Aggregate formula list.
         * @throws {Error} If the request failed due to some error.
         */
        getAggregateFormulas(config?: Config): Promise<JSONArray>;
    }

    class ViewAPI {
        /**
         * Constructs a ViewAPI instance
         * @param {AnalyticsClient} ac - The analytics client instance
         * @param {string} orgId - The organization ID
         * @param {string} workspaceId - The workspace ID
         * @param {string} viewId - The view ID
         */
        constructor(ac: AnalyticsClient, orgId: string, workspaceId: string, viewId: string);

        /**
         * Rename a specified view in the workspace.
         * @param {string} viewName - New name of the view.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        rename(viewName: string, config?: Config): Promise<void>;

        /**
         * Delete a specified view in the workspace.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        delete(config?: Config): Promise<void>;


        /**
         * Add a lookup in the specified child table.
         * @param {string} columnId - Id of the column.
         * @param {string} refViewId - The id of the table contains the parent column.
         * @param {string} refColumnId - The id of the parent column.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        addLookup(columnId: string, refViewId: string, refColumnId: string, config?: Config): Promise<void>;

        /**
         * Add lookup to the specified column in the table (V2 - supports multiple references and relation types).
         * @param {string} columnId - Id of the column.
         * @param {Array} references - Array of reference objects. Each object should have:
         *   - viewId: ID of the view to which the lookup relationship is being established
         *   - columnId: ID of the column in the referenced view
         *   - relationType: Type of relationship ("ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_MANY", "MANY_TO_ONE")
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        addLookupV2(columnId: string, references: Array<{viewId: string, columnId: string, relationType: string}>, config?: Config): Promise<void>;

        /**
         * Remove the lookup for the specified column in the table.
         * @param {string} columnId - Id of the column.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<void>}
         * @throws {Error} If the request failed due to some error.
         */
        removeLookup(columnId: string, config?: Config): Promise<void>;

        /**
         * Returns list of all aggregate formulas for the specified table/view.
         * @returns {Promise<JSONArray>} Aggregate formula list.
         * @throws {Error} If the request failed due to some error.
         */
        getAggregateFormulas(): Promise<JSONArray>;

        /**
         * Add an aggregate formula in the specified table/view.
         * @param {string} formulaName - Name of the aggregate formula to be created.
         * @param {string} expression - Formula expression (e.g. SUM("Revenue")).
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Created formula id.
         * @throws {Error} If the request failed due to some error.
         */
        addAggregateFormula(formulaName: string, expression: string, config?: Config): Promise<string>;

        addRow(columnValues, config?: Config): Promise<void>;

        deleteRow(criteria, config={}): Promise<void>;

        updateRow(columnValues, criteria, config={}): Promise<void>
    }

    class BulkAPI {
        /**
         * Constructs a BulkAPI instance
         * @param {AnalyticsClient} ac - The analytics client instance
         * @param {string} orgId - The organization ID
         * @param {string} workspaceId - The workspace ID
         */
        constructor(ac: AnalyticsClient, orgId: string, workspaceId: string);

        /**
         * Create a new table and import the data contained in the mentioned file into the created table.
         * @param {string} tableName - Name of the new table to be created.
         * @param {string} fileType - Type of the file to be imported.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} filePath - Path of the file to be imported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<Object>} Import result.
         * @throws {Error} If the request failed due to some error.
         */
        importDataInNewTable(tableName: string, fileType: string, autoIdentify: string, filePath: string, config?: Config): Promise<Object>;
        
        /**
         * Create a new table and import the raw data provided into the created table.
         * @param {string} tableName - Name of the new table to be created.
         * @param {string} fileType - Type of the file to be imported.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} data - Raw data to be imported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<Object>} Import result.
         * @throws {Error} If the request failed due to some error.
         */
        importRawDataInNewTable(tableName: string, fileType: string, autoIdentify: string, data: string, config?: Config): Promise<Object>;

        /**
         * Import the data contained in the mentioned file into the table.
         * @param {string} viewId - Id of the view where the data to be imported.
         * @param {string} importType - The type of import. Can be one of - append, truncateadd, updateadd.
         * @param {string} fileType - Type of the file to be imported.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} filePath - Path of the file to be imported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<Object>} Import result.
         * @throws {Error} If the request failed due to some error.
         */
        importData(viewId: string, importType: string, fileType: string, autoIdentify: string, filePath: string, config?: Config): Promise<Object>;

        /**
         * Import the raw data provided into the table.
         * @param {string} viewId - Id of the view where the data to be imported.
         * @param {string} importType - The type of import. Can be one of - append, truncateadd, updateadd.
         * @param {string} fileType - Type of the file to be imported.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} data - Raw data to be imported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<Object>} Import result.
         * @throws {Error} If the request failed due to some error.
         */
        importRawData(viewId: string, importType: string, fileType: string, autoIdentify: string, data: string, config?: Config): Promise<Object>;

        /**
         * Asynchronously create a new table and import the data contained in the mentioned file into the created table.
         * @param {string} tableName - Name of the new table to be created.
         * @param {string} fileType - Type of the file to be imported.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} filePath - Path of the file to be imported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Import job id.
         * @throws {Error} If the request failed due to some error.
         */
        importBulkDataInNewTable(tableName: string, fileType: string, autoIdentify: string, filePath: string, config?: Config): Promise<string>;
        
        /**
         * Create a new table and import the data contained in the mentioned file into the created table.
         * @param {string} tableName - Name of the new table to be created.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} filePath - Path of the file to be imported.
         * @param {number} batchSize - Number of lines per batch.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Import result.
         * @throws {Error} If the request failed due to some error.
         */
        importDataInNewTableAsBatches(tableName: string, autoIdentify: string, filePath: string, batchSize: number, config?: Config): Promise<string>;

        /**
         * Asynchronously import the data contained in the mentioned file into the table.
         * @param {string} viewId - Id of the view where the data to be imported.
         * @param {string} importType - The type of import. Can be one of - append, truncateadd, updateadd.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} filePath - Path of the file to be imported.
         * @param {number} batchSize - Number of lines per batch.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Import job id.
         * @throws {Error} If the request failed due to some error.
         */
        importBulkDataAsBatches(viewId: string, importType: string, autoIdentify: string, filePath: string, batchSize: number, config?: Config): Promise<string>;
        
        /**
         * Asynchronously import the data contained in the mentioned file into the table.
         * @param {string} viewId - Id of the view where the data to be imported.
         * @param {string} importType - The type of import. Can be one of - append, truncateadd, updateadd.
         * @param {string} fileType - Type of the file to be imported.
         * @param {string} autoIdentify - Used to specify whether to auto identify the CSV format.
         * @param {string} filePath - Path of the file to be imported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Import job id.
         * @throws {Error} If the request failed due to some error.
         */
        importBulkData(viewId: string, importType: string, fileType: string, autoIdentify: string, filePath: string, config?: Config): Promise<string>;

        /**
         * Returns the details of the import job.
         * @param {string} jobId - Id of the job.
         * @returns {Promise<Object>} Import job details.
         * @throws {Error} If the request failed due to some error.
         */
        getImportJobDetails(jobId: string): Promise<Object>;

        /**
         * Export the mentioned table (or) view data.
         * @param {string} viewId - Id of the view to be exported.
         * @param {string} responseFormat - The format in which the data is to be exported.
         * @param {string} filePath - Path of the file where the data exported to be stored.
         * @param {Config} [config] - Contains any additional control attributes.
         * @throws {Error} If the request failed due to some error.
         */
        exportData(viewId: string, responseFormat: string, filePath: string, config?: Config): Promise<void>;

        /**
         * Initiate asynchronous export for the mentioned table (or) view data.
         * @param {string} viewId - Id of the view to be exported.
         * @param {string} responseFormat - The format in which the data is to be exported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Export job id.
         * @throws {Error} If the request failed due to some error.
         */
        initiateBulkExport(viewId: string, responseFormat: string, config?: Config): Promise<string>;

        /**
         * Initiate asynchronous export with the given SQL Query.
         * @param {string} sqlQuery - The SQL Query whose output is exported.
         * @param {string} responseFormat - The format in which the data is to be exported.
         * @param {Config} [config] - Contains any additional control attributes.
         * @returns {Promise<string>} Export job id.
         * @throws {Error} If the request failed due to some error.
         */
        initiateBulkExportUsingSQL(sqlQuery: string, responseFormat: string, config?: Config): Promise<string>;

        /**
         * Returns the details of the export job.
         * @param {string} jobId - Id of the export job.
         * @returns {Promise<Object>} Export job details.
         * @throws {Error} If the request failed due to some error.
         */
        getExportJobDetails(jobId: string): Promise<Object>;

        /**
         * Download the exported data for the mentioned job id.
         * @param {string} jobId - Id of the job to be exported.
         * @param {string} filePath - Path of the file where the data exported to be stored.
         * @throws {Error} If the request failed due to some error.
         */
        exportBulkData(jobId: string, filePath: string): Promise<void>;
    }
}

export default AnalyticsClient;