# datalens-mcp — tool snapshot

**70 tools** · 🟢 35 read · 🟠 14 create · 🔴 21 modify · ⛔ 0 delete

68 generated from the live DataLens OpenAPI (`npm run gen:tools`, verified by `npm run check:tools`) + composite tools (`get_entry`, `clone_entry`). Reads free; create needs explicit command; modify + sensitive creates need explicit confirmation.

## Composite (2)
- 🟠 create  `clone_entry`
- 🟢 read    `get_entry`

## Navigation (2)
- 🟢 read    `get_entries` → getEntries
- 🟢 read    `list_directory` → listDirectory

## Collection (11)
- 🟠 create  `create_collection` → createCollection
- 🔴 modify  `move_collection` → moveCollection
- 🔴 modify  `move_collections` → moveCollections
- 🔴 modify  `update_collection` → updateCollection
- 🔴 modify  `update_collection_access_bindings` → updateCollectionAccessBindings ⚠️sensitive
- 🟢 read    `get_collection` → getCollection
- 🟢 read    `get_collection_breadcrumbs` → getCollectionBreadcrumbs
- 🟢 read    `get_collection_content` → getCollectionContent
- 🟢 read    `get_collections_by_ids` → getCollectionsByIds
- 🟢 read    `get_root_collection_permissions` → getRootCollectionPermissions
- 🟢 read    `list_collection_access_bindings` → listCollectionAccessBindings

## Workbook (10)
- 🟠 create  `create_workbook` → createWorkbook
- 🔴 modify  `move_workbook` → moveWorkbook
- 🔴 modify  `move_workbooks` → moveWorkbooks
- 🔴 modify  `update_workbook` → updateWorkbook
- 🔴 modify  `update_workbook_access_bindings` → updateWorkbookAccessBindings ⚠️sensitive
- 🟢 read    `get_workbook` → getWorkbook
- 🟢 read    `get_workbook_entries` → getWorkbookEntries
- 🟢 read    `get_workbooks_by_ids` → getWorkbooksByIds
- 🟢 read    `get_workbooks_list` → getWorkbooksList
- 🟢 read    `list_workbook_access_bindings` → listWorkbookAccessBindings

## Entries (3)
- 🔴 modify  `rename_entry` → renameEntry
- 🟢 read    `get_entries_permissions` → getEntriesPermissions
- 🟢 read    `get_entries_relations` → getEntriesRelations

## Folder (1)
- 🟠 create  `create_folder` → createFolder ⚠️sensitive

## Dashboard (3)
- 🟠 create  `create_dashboard` → createDashboard
- 🔴 modify  `update_dashboard` → updateDashboard
- 🟢 read    `get_dashboard` → getDashboard

## Wizard (3)
- 🟠 create  `create_wizard_chart` → createWizardChart
- 🔴 modify  `update_wizard_chart` → updateWizardChart
- 🟢 read    `get_wizard_chart` → getWizardChart

## QL (3)
- 🟠 create  `create_ql_chart` → createQLChart
- 🔴 modify  `update_ql_chart` → updateQLChart
- 🟢 read    `get_ql_chart` → getQLChart

## Editor (3)
- 🟠 create  `create_editor_chart` → createEditorChart
- 🔴 modify  `update_editor_chart` → updateEditorChart
- 🟢 read    `get_editor_chart` → getEditorChart

## Dataset (4)
- 🟠 create  `create_dataset` → createDataset
- 🔴 modify  `update_dataset` → updateDataset
- 🟢 read    `get_dataset` → getDataset
- 🟢 read    `validate_dataset` → validateDataset

## Connection (3)
- 🟠 create  `create_connection` → createConnection
- 🔴 modify  `update_connection` → updateConnection
- 🟢 read    `get_connection` → getConnection

## Reports (3)
- 🟠 create  `create_report` → createReport
- 🔴 modify  `update_report` → updateReport
- 🟢 read    `get_report` → getReport

## Embeds (3)
- 🟠 create  `create_embed` → createEmbed ⚠️sensitive
- 🔴 modify  `update_embed` → updateEmbed
- 🟢 read    `list_embeds` → listEmbeds

## EmbeddingSecrets (3)
- 🟠 create  `create_embedding_secret` → createEmbeddingSecret ⚠️sensitive
- 🟢 read    `get_embedding_secret` → getEmbeddingSecret
- 🟢 read    `list_embedding_secrets` → listEmbeddingSecrets

## WorkbookExport (4)
- 🟠 create  `start_workbook_export` → startWorkbookExport ⚠️sensitive
- 🔴 modify  `cancel_workbook_export` → cancelWorkbookExport
- 🟢 read    `get_workbook_export_result` → getWorkbookExportResult
- 🟢 read    `get_workbook_export_status` → getWorkbookExportStatus

## WorkbookImport (2)
- 🔴 modify  `start_workbook_import` → startWorkbookImport ⚠️sensitive
- 🟢 read    `get_workbook_import_status` → getWorkbookImportStatus

## SharedEntry (1)
- 🟢 read    `list_shared_entry_access_bindings` → listSharedEntryAccessBindings

## Licensing (4)
- 🔴 modify  `assign_licenses` → assignLicenses ⚠️sensitive
- 🔴 modify  `set_license_limit` → setLicenseLimit
- 🟢 read    `get_licenses` → getLicenses
- 🟢 read    `get_licenses_limit` → getLicensesLimit

## Audit (2)
- 🟢 read    `get_audit_entries_updates` → getAuditEntriesUpdates
- 🟢 read    `get_audit_entry_permissions_for_user` → getAuditEntryPermissionsForUser
