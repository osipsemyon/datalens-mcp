/**
 * Declarative tool registry — GENERATED from the DataLens public OpenAPI spec
 * (https://api.datalens.tech, title "DataLens API"). One entry per RPC method.
 *
 * Each tool's input schema mirrors the API request body 1:1, so validated args are
 * forwarded verbatim — no per-tool adapters, no schema drift. Complex/opaque bodies
 * (connections, whose shape is a 29-variant union over db type) are accepted as a single
 * loose `body` object and passed through.
 *
 * SAFETY: this server is non-destructive. There are NO delete_ tools (deleteDashboard,
 * deleteWorkbook, ... are intentionally omitted). create_ tools require an explicit user
 * command; modify tools (update_/move_/rename_/...) additionally require explicit
 * user confirmation. See index.ts for how `kind` drives annotations and the safety policy.
 */
import { z, type ZodRawShape } from "zod";

/** An arbitrary JSON object — used for payloads too large to model field-by-field. */
const json = () => z.record(z.string(), z.any());

/** Whether a tool only reads, creates new objects, or modifies existing ones. */
export type ToolKind = "read" | "create" | "modify";

export interface ToolSpec {
  name: string;
  description: string;
  /** Zod raw shape used as the tool's input schema. */
  schema: ZodRawShape;
  /** DataLens RPC method name. */
  method: string;
  /** Read-only, creates new objects, or modifies existing ones. Drives MCP annotations. */
  kind: ToolKind;
  /** Map validated args to the RPC body. Defaults to identity (forward as-is). */
  build?: (args: Record<string, unknown>) => unknown;
}

export const TOOLS: ToolSpec[] = [

  // ----------------------------------------------------------------- Navigation
  {
    name: "get_entries",
    description: "Get entries",
    method: "getEntries",
    kind: "read",
    schema: {
      scope: z.string().optional().describe("Entry scope: dash | widget | dataset | connection | folder"),
      ids: z.union([z.string(), z.array(z.string())]).optional().describe("Specific entry ID(s) to fetch, instead of a scope"),
      includeData: z.boolean().optional(),
      includeLinks: z.boolean().optional(),
      includePermissionsInfo: z.boolean().optional(),
      ignoreWorkbookEntries: z.boolean().optional(),
      excludeLocked: z.boolean().optional(),
      filters: json().optional(),
      orderBy: json().optional(),
      createdBy: z.union([z.string(), z.array(z.string())]).optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
    },
  },
  {
    name: "list_directory",
    description: "List directory",
    method: "listDirectory",
    kind: "read",
    schema: {
      path: z.string().optional().describe("Directory path to list entries from."),
      createdBy: z.union([z.string(), z.array(z.string())]).optional().describe("Filter entries by creator."),
      orderBy: json().optional().describe("Sorting configuration."),
      filters: json().optional().describe("Filtering configuration."),
      page: z.number().optional().describe("Page number for pagination."),
      pageSize: z.number().optional().describe("Number of entries per page."),
      includePermissionsInfo: z.boolean().optional().describe("Include permission information in response."),
    },
  },

  // ----------------------------------------------------------------- Collection
  {
    name: "create_collection",
    description: "Create collection",
    method: "createCollection",
    kind: "create",
    schema: {
      title: z.string(),
      description: z.string().optional(),
      parentId: z.string().nullable(),
    },
  },
  {
    name: "get_collection",
    description: "Get collection",
    method: "getCollection",
    kind: "read",
    schema: {
      collectionId: z.string(),
      includePermissionsInfo: z.boolean().optional(),
    },
  },
  {
    name: "get_collection_breadcrumbs",
    description: "Get collection breadcrumbs",
    method: "getCollectionBreadcrumbs",
    kind: "read",
    schema: {
      collectionId: z.string(),
      includePermissionsInfo: z.boolean().optional(),
    },
  },
  {
    name: "get_collection_content",
    description: "Get collection content",
    method: "getCollectionContent",
    kind: "read",
    schema: {
      collectionId: z.string().nullable(),
      page: z.string().nullable().optional(),
      filterString: z.string().optional(),
      orderField: z.enum(["title", "createdAt", "updatedAt"]).optional(),
      orderDirection: z.enum(["asc", "desc"]).optional(),
      onlyMy: z.boolean().optional(),
      mode: z.enum(["all", "onlyCollections", "onlyWorkbooks"]).optional(),
      pageSize: z.number().optional(),
      includePermissionsInfo: z.boolean().optional(),
    },
  },
  {
    name: "get_collections_by_ids",
    description: "Get collections list by ids",
    method: "getCollectionsByIds",
    kind: "read",
    schema: {
      collectionIds: z.array(z.string()),
    },
  },
  {
    name: "get_root_collection_permissions",
    description: "Get root collection permissions",
    method: "getRootCollectionPermissions",
    kind: "read",
    schema: {},
  },
  {
    name: "list_collection_access_bindings",
    description: "List collection access bindings",
    method: "listCollectionAccessBindings",
    kind: "read",
    schema: {
      collectionId: z.string(),
      getInheritedBindings: z.boolean().optional(),
      pageSize: z.number().optional(),
      pageToken: z.string().optional(),
    },
  },
  {
    name: "move_collection",
    description: "Move collection",
    method: "moveCollection",
    kind: "modify",
    schema: {
      collectionId: z.string(),
      parentId: z.string().nullable(),
      title: z.string().optional(),
    },
  },
  {
    name: "move_collections",
    description: "Move collections",
    method: "moveCollections",
    kind: "modify",
    schema: {
      collectionIds: z.array(z.string()),
      parentId: z.string().nullable(),
    },
  },
  {
    name: "update_collection",
    description: "Update collection",
    method: "updateCollection",
    kind: "modify",
    schema: {
      collectionId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
    },
  },
  {
    name: "update_collection_access_bindings",
    description: "Update collection access bindings",
    method: "updateCollectionAccessBindings",
    kind: "modify",
    schema: {
      collectionId: z.string(),
      deltas: z.array(z.any()),
    },
  },

  // ----------------------------------------------------------------- Workbook
  {
    name: "create_workbook",
    description: "Create workbook",
    method: "createWorkbook",
    kind: "create",
    schema: {
      collectionId: z.string().nullable().optional(),
      title: z.string(),
      description: z.string().optional(),
    },
  },
  {
    name: "get_workbook",
    description: "Get workbook",
    method: "getWorkbook",
    kind: "read",
    schema: {
      workbookId: z.string(),
      includePermissionsInfo: z.boolean().optional(),
    },
  },
  {
    name: "get_workbook_entries",
    description: "Get workbook entries",
    method: "getWorkbookEntries",
    kind: "read",
    schema: {
      workbookId: z.string(),
      includePermissionsInfo: z.boolean().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      createdBy: z.string().optional(),
      scope: z.union([z.string(), z.array(z.string())]).optional(),
      orderBy: json().optional(),
      filters: json().optional(),
    },
  },
  {
    name: "get_workbooks_by_ids",
    description: "Get workbook list by ids",
    method: "getWorkbooksByIds",
    kind: "read",
    schema: {
      workbookIds: z.array(z.string()),
    },
  },
  {
    name: "get_workbooks_list",
    description: "Get workbooks list",
    method: "getWorkbooksList",
    kind: "read",
    schema: {
      collectionId: z.string().nullable().optional(),
      includePermissionsInfo: z.boolean().optional(),
      filterString: z.string().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      orderField: z.enum(["title", "createdAt", "updatedAt"]).optional(),
      orderDirection: z.enum(["asc", "desc"]).optional(),
      onlyMy: z.boolean().optional(),
    },
  },
  {
    name: "list_workbook_access_bindings",
    description: "List workbook access bindings",
    method: "listWorkbookAccessBindings",
    kind: "read",
    schema: {
      workbookId: z.string(),
      getInheritedBindings: z.boolean().optional(),
      pageSize: z.number().optional(),
      pageToken: z.string().optional(),
    },
  },
  {
    name: "move_workbook",
    description: "Move workbook",
    method: "moveWorkbook",
    kind: "modify",
    schema: {
      workbookId: z.string(),
      collectionId: z.string().nullable(),
      title: z.string().optional(),
    },
  },
  {
    name: "move_workbooks",
    description: "Move workbooks",
    method: "moveWorkbooks",
    kind: "modify",
    schema: {
      workbookIds: z.array(z.string()),
      collectionId: z.string().nullable(),
    },
  },
  {
    name: "update_workbook",
    description: "Update workbook",
    method: "updateWorkbook",
    kind: "modify",
    schema: {
      workbookId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
    },
  },
  {
    name: "update_workbook_access_bindings",
    description: "Update workbook access bindings",
    method: "updateWorkbookAccessBindings",
    kind: "modify",
    schema: {
      workbookId: z.string(),
      deltas: z.array(z.any()),
    },
  },

  // ----------------------------------------------------------------- Entries
  {
    name: "get_entries_permissions",
    description: "Get entries permissions",
    method: "getEntriesPermissions",
    kind: "read",
    schema: {
      entryIds: z.array(z.string()),
    },
  },
  {
    name: "get_entries_relations",
    description: "Get entries relations",
    method: "getEntriesRelations",
    kind: "read",
    schema: {
      entryIds: z.array(z.string()).describe("ID of the entries to get relations for."),
      linkDirection: z.enum(["from", "to"]).optional().describe("The direction of the link relatively to the original entry: - `from` — entries that are linked to the original entry - `to` — the original entry is linked to the entries"),
      includePermissionsInfo: z.boolean().optional().describe("Include permission information in the response."),
      limit: z.number().optional().describe("Maximum number of results to return."),
      pageToken: z.string().optional().describe("Token for retrieving the next page of results."),
      scope: z.enum(["dash", "report", "widget", "dataset", "folder", "connection"]).optional().describe("Type of the entry: - `dash` — dashboard - `widget` — chart - `dataset` — dataset - `folder` — folder - `connection` — connection"),
    },
  },
  {
    name: "rename_entry",
    description: "Rename entry",
    method: "renameEntry",
    kind: "modify",
    schema: {
      entryId: z.string(),
      name: z.string(),
    },
  },

  // ----------------------------------------------------------------- Folder
  {
    name: "create_folder",
    description: "CreateFolder",
    method: "createFolder",
    kind: "create",
    schema: {
      key: z.string(),
      initialPermissions: json().optional(),
    },
  },

  // ----------------------------------------------------------------- Dashboard
  {
    name: "create_dashboard",
    description: "🚧 [Experimental] Create dashboard",
    method: "createDashboard",
    kind: "create",
    schema: {
      entry: json(),
    },
  },
  {
    name: "get_dashboard",
    description: "🚧 [Experimental] Get dashboard",
    method: "getDashboard",
    kind: "read",
    schema: {
      dashboardId: z.string(),
      revId: z.string().optional(),
      includePermissions: z.boolean().optional(),
      includeLinks: z.boolean().optional(),
      includeFavorite: z.boolean().optional(),
      branch: z.enum(["saved", "published"]).optional(),
      workbookId: z.string().optional(),
    },
  },
  {
    name: "update_dashboard",
    description: "🚧 [Experimental] Update dashboard",
    method: "updateDashboard",
    kind: "modify",
    schema: {
      entry: json(),
      mode: z.enum(["save", "publish"]),
    },
  },

  // ----------------------------------------------------------------- Wizard
  {
    name: "create_wizard_chart",
    description: "🚧 [Experimental] Create wizard chart",
    method: "createWizardChart",
    kind: "create",
    schema: {
      template: z.enum(["datalens"]),
      annotation: json().optional(),
      data: json(),
      key: z.string().optional(),
      workbookId: z.string().optional(),
      name: z.string().optional(),
    },
  },
  {
    name: "get_wizard_chart",
    description: "🚧 [Experimental] Get wizard chart",
    method: "getWizardChart",
    kind: "read",
    schema: {
      chartId: z.string(),
      workbookId: z.string().nullable().optional(),
      revId: z.string().optional(),
      includePermissions: z.boolean().optional(),
      includeLinks: z.boolean().optional(),
      includeFavorite: z.boolean().optional(),
      branch: z.enum(["saved", "published"]).optional(),
    },
  },
  {
    name: "update_wizard_chart",
    description: "🚧 [Experimental] Update wizard chart",
    method: "updateWizardChart",
    kind: "modify",
    schema: {
      entryId: z.string(),
      template: z.enum(["datalens"]),
      annotation: json().optional(),
      mode: z.enum(["save", "publish"]),
      data: json(),
    },
  },

  // ----------------------------------------------------------------- QL
  {
    name: "create_ql_chart",
    description: "🚧 [Experimental] Create QL chart",
    method: "createQLChart",
    kind: "create",
    schema: {
      template: z.enum(["ql"]),
      annotation: json().optional(),
      data: json(),
      key: z.string().optional(),
      workbookId: z.string().optional(),
      name: z.string().optional(),
    },
  },
  {
    name: "get_ql_chart",
    description: "🚧 [Experimental] Get QL chart",
    method: "getQLChart",
    kind: "read",
    schema: {
      chartId: z.string().describe("ID of the QL chart to return. You can find it in the chart settings in DataLens interface."),
      workbookId: z.string().nullable().optional().describe("ID of the workbook the QL chart belongs to. If navigation across folders is enabled and the QL chart belongs to a folder, the value must be `null`."),
      revId: z.string().optional().describe("Version ID for the QL chart.<br/> If the field is empty, you will get the current version of the QL chart."),
      includePermissions: z.boolean().optional().describe("Include information on configured permissions in the response."),
      includeLinks: z.boolean().optional().describe("Include information on configured links in the response."),
      includeFavorite: z.boolean().optional().describe("Include favorite status in the response."),
      branch: z.enum(["saved", "published"]).optional(),
    },
  },
  {
    name: "update_ql_chart",
    description: "🚧 [Experimental] Update QL chart",
    method: "updateQLChart",
    kind: "modify",
    schema: {
      entryId: z.string(),
      template: z.enum(["ql"]),
      annotation: json().optional(),
      mode: z.enum(["save", "publish"]),
      data: json(),
    },
  },

  // ----------------------------------------------------------------- Editor
  {
    name: "create_editor_chart",
    description: "🚧 [Experimental] Create editor chart",
    method: "createEditorChart",
    kind: "create",
    schema: {
      entry: json(),
    },
  },
  {
    name: "get_editor_chart",
    description: "🚧 [Experimental] Get editor chart",
    method: "getEditorChart",
    kind: "read",
    schema: {
      chartId: z.string().describe("ID of the Editor chart to return. You can find it in the chart settings in DataLens interface."),
      workbookId: z.string().nullable().optional().describe("ID of the workbook the Editor chart belongs to. If navigation across folders is enabled and the Editor chart belongs to a folder, the value must be null."),
      revId: z.string().optional().describe("Version ID for the Editor chart."),
      includePermissions: z.boolean().optional().describe("Include information on configured permissions in the response."),
      includeLinks: z.boolean().optional().describe("Include information on configured links in the response."),
      includeFavorite: z.boolean().optional().describe("Include favorite status in the response."),
      branch: z.enum(["saved", "published"]).optional(),
    },
  },
  {
    name: "update_editor_chart",
    description: "🚧 [Experimental] Update editor chart",
    method: "updateEditorChart",
    kind: "modify",
    schema: {
      mode: z.enum(["save", "publish"]),
      entry: json(),
    },
  },

  // ----------------------------------------------------------------- Dataset
  {
    name: "create_dataset",
    description: "Create dataset",
    method: "createDataset",
    kind: "create",
    schema: {
      collection_id: z.string().optional(),
      created_via: z.any().optional(),
      dataset: json(),
      dir_path: z.string().optional(),
      name: z.string().optional(),
      options: json().optional(),
      preview: z.boolean().optional(),
      workbook_id: z.string().optional(),
    },
  },
  {
    name: "get_dataset",
    description: "Get dataset",
    method: "getDataset",
    kind: "read",
    schema: {
      datasetId: z.string(),
      workbookId: z.string().nullable().optional(),
      rev_id: z.string().optional(),
    },
  },
  {
    name: "update_dataset",
    description: "Update dataset. FULL-BODY replace: `data` is saved as the entire new dataset body (fields omitted from it are dropped); if `data` is omitted, the current body is re-saved as a new revision.",
    method: "updateDataset",
    kind: "modify",
    schema: {
      datasetId: z.string(),
      workbookId: z.string().nullable().optional().describe("Workbook the dataset belongs to — used only to fetch the current head revision before saving; not sent to updateDataset itself."),
      data: json().optional(),
    },
  },
  {
    name: "validate_dataset",
    description: "Validate dataset",
    method: "validateDataset",
    kind: "read",
    schema: {
      datasetId: z.string(),
      workbookId: z.string().nullable().optional(),
      data: json().optional(),
    },
  },

  // ----------------------------------------------------------------- Connection
  {
    name: "create_connection",
    description: "Create connection",
    method: "createConnection",
    kind: "create",
    schema: {
      body: json().describe("Full request body for createConnection (type-specific / large payload)"),
    },
    build: ({ body }) => body,
  },
  {
    name: "get_connection",
    description: "Get connection",
    method: "getConnection",
    kind: "read",
    schema: {
      connectionId: z.string(),
      workbookId: z.string().nullable().optional(),
      bindedDatasetId: z.string().nullable().optional(),
      rev_id: z.string().optional(),
    },
  },
  {
    name: "update_connection",
    description: "Update connection",
    method: "updateConnection",
    kind: "modify",
    schema: {
      connectionId: z.string(),
      data: json().optional(),
    },
  },

  // ----------------------------------------------------------------- Reports
  {
    name: "create_report",
    description: "Create report",
    method: "createReport",
    kind: "create",
    schema: {
      data: json(),
      meta: json().nullable(),
      annotation: json().optional(),
      key: z.string().optional(),
      workbookId: z.string().optional(),
      name: z.string().optional(),
    },
  },
  {
    name: "get_report",
    description: "Get report",
    method: "getReport",
    kind: "read",
    schema: {
      entryId: z.string(),
      revId: z.string().optional(),
      includePermissions: z.boolean().optional(),
      includeFavorite: z.boolean().optional(),
    },
  },
  {
    name: "update_report",
    description: "Update report",
    method: "updateReport",
    kind: "modify",
    schema: {
      entryId: z.string(),
      data: json(),
      mode: z.enum(["save", "publish"]),
      revId: z.string().optional(),
      meta: json().nullable(),
      annotation: json().optional(),
    },
  },

  // ----------------------------------------------------------------- Embeds
  {
    name: "create_embed",
    description: "Create embed",
    method: "createEmbed",
    kind: "create",
    schema: {
      title: z.string().describe("Name of the embedding."),
      embeddingSecretId: z.string().describe("ID of the key for embedding used for authentication."),
      entryId: z.string().describe("ID of the entry to be privately embedded."),
      depsIds: z.array(z.string()).describe("Array of dependency entry IDs."),
      unsignedParams: z.array(z.string()).describe("Array of unsigned parameters to be provided in the embedding link."),
      privateParams: z.array(z.string()).describe("Array of signed parameters that are provided as part of the token."),
      publicParamsMode: z.boolean().describe("Whether default parameters mode is enabled."),
      settings: json(),
    },
  },
  {
    name: "list_embeds",
    description: "List embeds",
    method: "listEmbeds",
    kind: "read",
    schema: {
      entryId: z.string().describe("ID of the entry to list embeddings for."),
    },
  },
  {
    name: "update_embed",
    description: "Update embed",
    method: "updateEmbed",
    kind: "modify",
    schema: {
      embedId: z.string().describe("ID of the embedding to update."),
      title: z.string().describe("Name of the embedding."),
      embeddingSecretId: z.string().describe("ID of the key for embedding used for authentication."),
      depsIds: z.array(z.string()).describe("Array of dependency entry IDs."),
      unsignedParams: z.array(z.string()).describe("Array of unsigned parameters to be provided in the embedding link."),
      privateParams: z.array(z.string()).describe("Array of signed parameters that are provided as part of the token."),
      publicParamsMode: z.boolean().describe("Whether default parameters mode is enabled."),
      settings: json(),
    },
  },

  // ----------------------------------------------------------------- EmbeddingSecrets
  {
    name: "create_embedding_secret",
    description: "Create embedding secret",
    method: "createEmbeddingSecret",
    kind: "create",
    schema: {
      title: z.string().describe("Name of the key for embedding to be created."),
      workbookId: z.string().describe("ID of the workbook to associate with the key for embedding."),
    },
  },
  {
    name: "get_embedding_secret",
    description: "Get embedding secret",
    method: "getEmbeddingSecret",
    kind: "read",
    schema: {
      embeddingSecretId: z.string().describe("ID of the key for embedding to retrieve."),
    },
  },
  {
    name: "list_embedding_secrets",
    description: "List embedding secrets",
    method: "listEmbeddingSecrets",
    kind: "read",
    schema: {
      workbookId: z.string().describe("ID of the workbook to list its keys for embedding."),
    },
  },

  // ----------------------------------------------------------------- WorkbookExport
  {
    name: "cancel_workbook_export",
    description: "Cancel workbook export",
    method: "cancelWorkbookExport",
    kind: "modify",
    schema: {
      exportId: z.string(),
    },
  },
  {
    name: "get_workbook_export_result",
    description: "Get workbook export result",
    method: "getWorkbookExportResult",
    kind: "read",
    schema: {
      exportId: z.string(),
    },
  },
  {
    name: "get_workbook_export_status",
    description: "Get workbook export status",
    method: "getWorkbookExportStatus",
    kind: "read",
    schema: {
      exportId: z.string(),
    },
  },
  {
    name: "start_workbook_export",
    description: "Start workbook export",
    method: "startWorkbookExport",
    kind: "create",
    schema: {
      workbookId: z.string(),
    },
  },

  // ----------------------------------------------------------------- WorkbookImport
  {
    name: "get_workbook_import_status",
    description: "Get workbook import status",
    method: "getWorkbookImportStatus",
    kind: "read",
    schema: {
      importId: z.string(),
    },
  },
  {
    name: "start_workbook_import",
    description: "Start workbook import",
    method: "startWorkbookImport",
    kind: "modify",
    schema: {
      data: json(),
      title: z.string(),
      description: z.string().optional(),
      collectionId: z.string().nullable(),
    },
  },

  // ----------------------------------------------------------------- SharedEntry
  {
    name: "list_shared_entry_access_bindings",
    description: "List shared entry access bindings",
    method: "listSharedEntryAccessBindings",
    kind: "read",
    schema: {
      entryId: z.string(),
      getInheritedBindings: z.boolean().optional(),
      pageSize: z.number().optional(),
      pageToken: z.string().optional(),
    },
  },

  // ----------------------------------------------------------------- Licensing
  {
    name: "assign_licenses",
    description: "Assign licenses",
    method: "assignLicenses",
    kind: "modify",
    schema: {
      userIds: z.array(z.string()),
    },
  },
  {
    name: "get_licenses",
    description: "Get licenses",
    method: "getLicenses",
    kind: "read",
    schema: {
      userIds: z.array(z.string()).optional(),
      status: z.enum(["active", "expired", "expiring"]).optional(),
      sortBy: z.enum(["createdAt", "updatedAt"]).optional(),
      order: z.enum(["asc", "desc"]).optional(),
      limit: z.number().optional(),
      pageToken: z.string().optional(),
    },
  },
  {
    name: "get_licenses_limit",
    description: "Get licenses limit",
    method: "getLicensesLimit",
    kind: "read",
    schema: {},
  },
  {
    name: "set_license_limit",
    description: "Set licenses limit",
    method: "setLicenseLimit",
    kind: "modify",
    schema: {
      value: z.number(),
    },
  },

  // ----------------------------------------------------------------- Audit
  {
    name: "get_audit_entries_updates",
    description: "Get updated entries for audit",
    method: "getAuditEntriesUpdates",
    kind: "read",
    schema: {
      from: z.string().describe("Start date for filtering entries by updatedAt"),
      to: z.string().optional().describe("End date for filtering entries by updatedAt"),
      limit: z.number().optional().describe("Maximum number of entries to return"),
      pageToken: z.string().optional().describe("Token for pagination"),
    },
  },
  {
    name: "get_audit_entry_permissions_for_user",
    description: "Get entry permissions for user",
    method: "getAuditEntryPermissionsForUser",
    kind: "read",
    schema: {
      entryIds: z.array(z.string()),
      userId: z.string(),
    },
  },
];
