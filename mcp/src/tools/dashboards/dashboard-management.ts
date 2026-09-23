import { z } from "zod";
import { defineTool } from "../../tool-registry";
import { getAnalyticsClient, config } from "../../utils/apiUtil";
import { retryWithFallback, ToolResponse, logAndReturnError } from "../../utils/common";

// ---- Shared Zod schemas for card and theme structures ----

/**
 * A single dashboard layout card. All cards share positional fields (type, width, height, left, top).
 * Additional fields depend on the card type:
 *   - VIEW   : viewName (string), properties (object)
 *   - HTML   : content (string — raw HTML)
 *   - TITLE  : content (string — text or HTML heading)
 *   - IMAGE  : content (string — image URL or base64 data URI)
 *   - EMBED  : content (string — embed URL or iframe HTML)
 *   - USERFILTERS: no additional fields required
 *
 * Grid rules: left + width ≤ 80, width ≥ 2, height ≥ 2, left ≥ 0, top ≥ 0.
 * Max 100 cards per dashboard. Cards must not overlap.
 */
const cardSchema = z
  .object({
    type: z
      .enum(["VIEW", "HTML", "USERFILTERS", "TITLE", "IMAGE", "EMBED"])
      .describe(
        'Card type. "VIEW" embeds an existing report; "HTML" displays custom HTML; ' +
          '"USERFILTERS" renders interactive filter panel; "TITLE" is a heading card; ' +
          '"IMAGE" displays an image; "EMBED" embeds an external URL or iframe.'
      ),
    width: z
      .number()
      .int()
      .min(2)
      .describe(
        "Card width in grid units (integer ≥ 2). The grid is 80 units wide; left + width must be ≤ 80."
      ),
    height: z.number().int().min(2).describe("Card height in grid units (integer ≥ 2)."),
    left: z
      .number()
      .int()
      .min(0)
      .describe(
        "Horizontal offset from the left edge of the grid (integer ≥ 0, 0-based). left + width must be ≤ 80."
      ),
    top: z
      .number()
      .int()
      .min(0)
      .describe("Vertical offset from the top of the canvas (integer ≥ 0, 0-based)."),
    viewName: z
      .string()
      .optional()
      .describe(
        'Required for type "VIEW". The display name of an existing report/view in this workspace. Must match exactly.'
      ),
    properties: z
      .record(z.string(), z.any())
      .optional()
      .describe('Required for type "VIEW". Can be an empty object {}. Holds view-level display overrides.'),
    content: z
      .string()
      .optional()
      .describe(
        'Required for types "HTML", "TITLE", "IMAGE", and "EMBED". ' +
          "For HTML/TITLE: raw HTML or text. For IMAGE: image URL or base64 data URI. " +
          "For EMBED: embed URL or iframe HTML. Must not be null."
      ),
  })
  .describe(
    "A dashboard layout card object. Each card occupies a position on the 80-unit-wide grid. " +
      "Cards must not overlap and must not exceed grid boundaries (left + width ≤ 80)."
  );

/**
 * Dashboard settings object. All boolean fields must be the string "true" or "false"
 * (not JSON boolean, not 1/0, not "yes"/"no").
 */
const settingsSchema = z
  .object({
    allowDrillDown: z
      .enum(["true", "false"])
      .optional()
      .describe('Enables drill-down on chart data points. Must be the string "true" or "false".'),
    hideColumnOptions: z
      .enum(["true", "false"])
      .optional()
      .describe('Hides column-level options from dashboard viewers. Must be "true" or "false".'),
    smartAlignCharts: z
      .enum(["true", "false"])
      .optional()
      .describe('Auto-aligns chart elements for visual consistency. Must be "true" or "false".'),
    enableSortMenu: z
      .enum(["true", "false"])
      .optional()
      .describe('Shows the sort menu on embedded reports. Must be "true" or "false".'),
    reportAsFilter: z
      .enum(["true", "false"])
      .optional()
      .describe(
        'Allows clicking a chart element to filter other dashboard cards. Must be "true" or "false".'
      ),
    showContextualOptions: z
      .enum(["true", "false"])
      .optional()
      .describe('Shows contextual action menus on dashboard cards. Must be "true" or "false".'),
    allowVUD: z
      .enum(["true", "false"])
      .optional()
      .describe(
        'Enables visual-update drill-down (VUD) for embedded reports. Must be "true" or "false".'
      ),
    allowExport: z
      .object({
        csv: z.enum(["true", "false"]).optional(),
        html: z.enum(["true", "false"]).optional(),
        excel: z.enum(["true", "false"]).optional(),
        pdf: z.enum(["true", "false"]).optional(),
        image: z.enum(["true", "false"]).optional(),
        zohoSheet: z.enum(["true", "false"]).optional(),
      })
      .optional()
      .describe(
        'Controls which export formats are available. Each sub-key must be "true" or "false". ' +
          "Supported keys: csv, html, excel, pdf, image, zohoSheet."
      ),
    allowInsights: z
      .enum(["true", "false"])
      .optional()
      .describe('Enables AI-powered Insights for embedded reports. Must be "true" or "false".'),
    fitToWidth: z
      .enum(["true", "false"])
      .optional()
      .describe('Scales embedded reports to fit the card width. Must be "true" or "false".'),
    enableGlobalUF: z
      .enum(["true", "false"])
      .optional()
      .describe('Enables the global user filter affecting all cards. Must be "true" or "false".'),
    enableGlobalValueUF: z
      .enum(["true", "false"])
      .optional()
      .describe('Enables value-based global user filters. Must be "true" or "false".'),
    applyImmediateUF: z
      .enum(["true", "false"])
      .optional()
      .describe('Applies user filter changes immediately without a confirmation click. Must be "true" or "false".'),
    timeSlicer: z
      .enum(["true", "false"])
      .optional()
      .describe('Enables the time slicer widget on the dashboard. Must be "true" or "false".'),
    layoutType: z
      .enum(["web", "mobile"])
      .optional()
      .describe('Specifies the target layout viewport. Allowed values: "web" or "mobile".'),
    layoutWidth: z
      .string()
      .optional()
      .describe('Sets the fixed layout width in pixels as a string (e.g. "1280").'),
  })
  .optional()
  .describe(
    "Dashboard behavior settings. All boolean fields must use the string values " +
      '"true" or "false" — not JSON booleans. Omit the entire object to keep server defaults.'
  );

/**
 * Dashboard themes object. Defines the visual appearance of the background and cards.
 * The `type` field determines which type-specific sub-object is required:
 *   - "solid"    → `solid` object with `background` (hex color string, e.g. "#333542")
 *   - "gradient" → `gradient` object with `startColor` and `endColor` (hex strings)
 *   - "image"    → `image` object with `url` (image URL string)
 * The `card` object is required for ALL theme types.
 * Only the sub-object matching the declared `type` should be present (others raise error 7493).
 */
const themesSchema = z
  .object({
    layoutType: z.number().int().optional().describe("Internal layout type identifier (e.g. 2)."),
    type: z
      .enum(["solid", "gradient", "image"])
      .describe(
        'Background style. "solid" uses a single hex color; "gradient" uses startColor/endColor; ' +
          '"image" uses a URL. The matching sub-object (solid/gradient/image) must be present ' +
          "and the other two must NOT be present."
      ),
    solid: z
      .object({
        background: z
          .string()
          .describe('Background color as a CSS hex string (e.g. "#333542"). Must be a string, not an integer.'),
      })
      .optional()
      .describe('Required when type is "solid". Must not be present when type is "gradient" or "image".'),
    gradient: z
      .object({
        startColor: z.string().describe("Start hex color (e.g. \"#333542\")."),
        endColor: z.string().describe("End hex color (e.g. \"#1A1B2E\")."),
      })
      .optional()
      .describe('Required when type is "gradient". Must not be present when type is "solid" or "image".'),
    image: z
      .object({
        url: z.string().describe("Image URL for the background."),
      })
      .optional()
      .describe('Required when type is "image". Must not be present when type is "solid" or "gradient".'),
    card: z
      .object({
        background: z.string().optional().describe("Card background hex color (e.g. \"#3E3F4D\")."),
        title: z
          .object({
            border: z
              .object({ color: z.string().describe("Card title border hex color.") })
              .optional(),
          })
          .optional()
          .describe("Card title styling."),
        border: z
          .object({
            color: z.string().describe("Card border hex color."),
            width: z.number().int().optional().describe("Card border width in pixels."),
          })
          .optional()
          .describe("Card border styling."),
        opacity: z.number().min(0).max(1).optional().describe("Card background opacity (0.0 – 1.0)."),
        blur: z.number().optional().describe("Background blur level."),
        radius: z.number().optional().describe("Card corner radius in pixels."),
        margin: z.number().optional().describe("Card margin in pixels."),
        shadow: z.number().optional().describe("Card shadow intensity."),
      })
      .describe(
        "Card-level visual styling. Required for ALL theme types. " +
          "All color fields must be hex strings (e.g. \"#6F738E\") — passing integers raises error 8509."
      ),
  })
  .optional()
  .describe(
    "Visual theme for the dashboard. The `type` field determines which background sub-object " +
      '(solid/gradient/image) is required. The `card` object is always required. ' +
      "Omit the entire themes object to use server defaults."
  );

// ---- Tool Registrations ----

defineTool({
  name: "readDashboardMetadata",
  description: `
    1. Use Case:
    - Retrieve the full design configuration (CONFIG JSON) of an existing dashboard in Zoho Analytics.
    - Returns the dashboard's displayName, layout (all cards with their positions and types),
      settings (behavior flags), and themes (visual appearance).

    2. IMPORTANT — Read Before Update:
    - ALWAYS call this tool before using updateDashboard. The update endpoint performs a full
      replacement of each top-level section (layout, settings, themes) — not a field-by-field merge.
    - Retrieve the current CONFIG here, make your targeted changes to the returned object,
      then re-submit the complete modified CONFIG via updateDashboard (read-modify-write pattern).
    - Submitting a partial layout (e.g. only some cards) will cause validation failures.

    3. Arguments:
    - workspaceId (str): The numeric ID of the workspace containing the dashboard.
    - dashboardId (str): The numeric ID of the dashboard whose metadata should be retrieved.
    - orgId (str | optional): Organization ID. Defaults to config.ORGID if not provided.

    4. Returns:
    - A JSON string with the full dashboard CONFIG: displayName, layout, settings, themes.
    - Use the returned layout/settings/themes objects directly as inputs to updateDashboard.
  `,
  args: {
    workspaceId: z.string().describe("The numeric ID of the workspace containing the dashboard."),
    dashboardId: z.string().describe("The numeric ID of the dashboard whose metadata to retrieve."),
    orgId: z
      .string()
      .optional()
      .describe("The organization ID. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, dashboardId, orgId }) => {
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
          const dashboardInst = ac.getDashboardInstance(org_id, workspace, dashboardId);
          const metadata = await (dashboardInst as any).getMetadata();
          return ToolResponse(JSON.stringify(metadata, null, 2));
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while retrieving the dashboard metadata");
    }
  },
});

defineTool({
  name: "createDashboard",
  description: `
    Create a new dashboard inside the specified workspace in Zoho Analytics.
    Maps directly to the Zoho Analytics Create Dashboard API (POST /workspaces/{WorkspaceID}/dashboards).
    OAuth Scope: ZohoAnalytics.modeling.create.

    Permission: Workspace Owner, Workspace Admin, or Organization Admin.
    Custom Role users can create dashboards only if the "Create New Reports" permission is enabled.

    -- Layout -----------------------------------------------------------------------
    The layout is a JSON object keyed by string card IDs (e.g. "1", "2", "3"). Each value is a
    card object defining its type, position, and type-specific content.

    REQUIRED for all cards:
      - type   (string): Card type — one of: VIEW, HTML, USERFILTERS, TITLE, IMAGE, EMBED
      - width  (integer ≥ 2): Card width in grid units
      - height (integer ≥ 2): Card height in grid units
      - left   (integer ≥ 0): Horizontal offset from left edge (0-based)
      - top    (integer ≥ 0): Vertical offset from top of canvas (0-based)

    Type-specific requirements:
      - VIEW         : viewName (string — display name of an existing report in this workspace)
                       properties (object — can be {})
      - HTML         : content (string — raw HTML markup, must not be null)
      - TITLE        : content (string — text or HTML heading)
      - IMAGE        : content (string — image URL or base64 data URI)
      - EMBED        : content (string — embed URL or iframe HTML)
      - USERFILTERS  : no additional fields required

    Grid constraints (violations cause 4xx errors):
      - Grid is 80 units wide. Every card must satisfy: left + width ≤ 80
      - No two cards may overlap on the grid
      - A dashboard may contain at most 100 cards
      - All positional values (width, height, left, top) must be plain integers
      - At least one VIEW-type card is required

    -- Settings (optional) ----------------------------------------------------------
    All boolean fields must be the STRING "true" or "false" — not JSON booleans.
    Key settings: allowDrillDown, fitToWidth, reportAsFilter, allowExport (nested object),
    enableGlobalUF, timeSlicer, layoutType ("web"/"mobile"), layoutWidth (pixel string).

    -- Themes (optional) ------------------------------------------------------------
    Visual theme for the dashboard. The "type" field determines which background sub-object
    is required ("solid" → solid.background, "gradient" → gradient.startColor + endColor,
    "image" → image.url). The "card" object is ALWAYS required regardless of theme type.
    Only the sub-object matching "type" should be present — mixing them raises error 7493.
    All color fields must be hex strings (e.g. "#333542"), NOT integers.

    -- Returns ----------------------------------------------------------------------
    The numeric ID of the created dashboard on success.
  `,
  args: {
    workspaceId: z
      .string()
      .describe("The numeric ID of the workspace in which to create the dashboard."),
    displayName: z
      .string()
      .max(200)
      .describe(
        "Display name for the dashboard. Must be unique within the workspace (max 200 characters). " +
          "Duplicate names cause error 7111."
      ),
    layout: z
      .record(z.string(), cardSchema)
      .describe(
        'Dashboard layout — a JSON object keyed by string card IDs (e.g. "1", "2", "3"). ' +
          "Each value is a card object with type, width, height, left, top, and type-specific fields. " +
          "Must contain at least one VIEW-type card. The grid is 80 units wide (left + width ≤ 80). " +
          "Cards must not overlap. Max 100 cards."
      ),
    settings: settingsSchema,
    themes: themesSchema,
    orgId: z
      .string()
      .optional()
      .describe("The organization ID. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, displayName, layout, settings, themes, orgId }) => {
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
          const dashboardId = await (workspaceInst as any).createDashboard(
            displayName,
            layout,
            settings ?? null,
            themes ?? null
          );
          return ToolResponse(`Dashboard created successfully. Dashboard ID: ${dashboardId}`);
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while creating the dashboard");
    }
  },
});

defineTool({
  name: "updateDashboard",
  description: `
    Update an existing dashboard in Zoho Analytics.
    Maps to the Zoho Analytics Update Dashboard API (PUT /workspaces/{WorkspaceID}/dashboards/{DashboardID}).
    OAuth Scope: ZohoAnalytics.modeling.update.

    Permission: Workspace Owner, Workspace Admin, or Organization Admin.
    Custom Role users require the "Edit Reports" permission.

    ⚠️ CRITICAL — READ-MODIFY-WRITE REQUIRED:
    - ALWAYS call readDashboardMetadata first to get the current CONFIG.
    - This API performs a FULL REPLACEMENT of each top-level section provided —
      it is NOT a field-by-field merge. If you include "layout", the ENTIRE layout is replaced.
      If you include "settings", ALL existing settings are replaced with what you send.
    - Omit a top-level key entirely to keep that section unchanged.
    - Never submit a partial layout (e.g. only some cards). Read the full layout, edit what
      you need, then PUT the complete modified layout back.
    - Submitting a partial layout will fail with INVALID_LAYOUT_JSON or VIEWS_NOT_FOUND errors.

    -- What you can update ----------------------------------------------------------
    - displayName (optional): Provide a new name to rename the dashboard.
    - layout (optional): If provided, must be the COMPLETE new layout (all cards).
      Same structure and constraints as createDashboard: VIEW/HTML/USERFILTERS/TITLE/IMAGE/EMBED
      card types; grid is 80 units wide; left + width ≤ 80; no overlaps; ≥1 VIEW card.
    - settings (optional): If provided, replaces ALL existing settings.
    - themes (optional): If provided, must include all required theme fields
      (type, type-specific sub-object, and card). Replaces ALL existing theme settings.

    At least one of displayName, layout, settings, or themes must be provided.

    -- Layout card types and constraints --------------------------------------------
    Same as createDashboard. All positional values must be integers. VIEW cards require
    viewName (existing report name) and properties (can be {}). Content-based cards
    (HTML, TITLE, IMAGE, EMBED) require the content field (non-null string).
    Grid: left + width ≤ 80, no overlaps, max 100 cards.

    -- Settings (optional) ----------------------------------------------------------
    All boolean fields must be the STRING "true" or "false" — not JSON booleans.

    -- Themes (optional) ------------------------------------------------------------
    Must include type ("solid"/"gradient"/"image"), the matching type-specific sub-object,
    and the card object. Only one background sub-object must be present.

    -- Returns ----------------------------------------------------------------------
    A success message on completion, or an error message describing the failure.
  `,
  args: {
    workspaceId: z
      .string()
      .describe("The numeric ID of the workspace containing the dashboard to update."),
    dashboardId: z
      .string()
      .describe("The numeric ID of the dashboard to update."),
    displayName: z
      .string()
      .max(200)
      .optional()
      .describe(
        "New display name for the dashboard (max 200 characters). " +
          "Omit to keep the existing name. Must be unique within the workspace."
      ),
    layout: z
      .record(z.string(), cardSchema)
      .optional()
      .describe(
        "COMPLETE replacement layout — a JSON object keyed by string card IDs. " +
          "If provided, the ENTIRE existing layout is replaced. Partial layouts are NOT supported. " +
          "Always read the current layout via readDashboardMetadata first, modify what you need, " +
          "then provide the full layout here. Same structure and constraints as createDashboard."
      ),
    settings: settingsSchema,
    themes: themesSchema,
    orgId: z
      .string()
      .optional()
      .describe("The organization ID. Defaults to config.ORGID if not provided."),
  },
  handler: async ({ workspaceId, dashboardId, displayName, layout, settings, themes, orgId }) => {
    try {
      if (!orgId) {
        orgId = config.ORGID || "";
      }

      // Ensure at least one field is being updated
      if (!displayName && !layout && !settings && !themes) {
        return ToolResponse(
          "No update fields provided. Please supply at least one of: displayName, layout, settings, or themes."
        );
      }

      return await retryWithFallback(
        [orgId],
        workspaceId,
        "WORKSPACE",
        async (org_id, workspace) => {
          const ac = getAnalyticsClient();
          const dashboardInst = ac.getDashboardInstance(org_id, workspace, dashboardId);
          await (dashboardInst as any).updateDashboard(
            displayName ?? null,
            layout ?? null,
            settings ?? null,
            themes ?? null
          );
          return ToolResponse("Dashboard updated successfully.");
        },
        workspaceId
      );
    } catch (err) {
      return logAndReturnError(err, "An error occurred while updating the dashboard");
    }
  },
});
