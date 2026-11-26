# Aggregate Formulas — Delete

Permanently removes an aggregate formula from a workspace in Zoho Analytics.

> **Pre-step:** Use `listAggregateFormulas` to find the `formulaId` of the formula you want to delete before calling this tool.

> ⚠️ **This operation is irreversible.** The aggregate formula will be permanently deleted and cannot be recovered.

## Tool: `deleteAggregateFormula`

### Arguments

- `workspaceId` (required): The ID of the workspace containing the aggregate formula.
- `formulaId` (required): The ID of the aggregate formula to delete. Obtain this from `listAggregateFormulas`.
- `deleteDependentViews` (optional, boolean): Controls behaviour when the formula is used in reports or dashboards.
  - `false` (default — safe mode): Deletion **fails** if any dependent views exist. Use this to avoid accidentally breaking reports.
  - `true` (cascade mode): Deletes the aggregate formula **and all dependent views** (reports/dashboards that reference it). Use only after confirming with the user.
- `orgId` (optional): Organization ID. Defaults to the configured `ORGID`.

### Important Notes

- By default (`deleteDependentViews` omitted or `false`), the deletion will **fail with an error** if any reports or dashboards depend on this formula. This is a safety guard.
- If deletion fails due to dependent views, either:
  1. Remove the formula from those views first, then retry the delete, **or**
  2. Set `deleteDependentViews: true` to cascade-delete all dependent views along with the formula — but **confirm this with the user first**.
- Always confirm with the user before setting `deleteDependentViews: true`, as it will permanently delete associated reports/dashboards.

### Tool Call

```js
return await tools.deleteAggregateFormula({
    "workspaceId": "<workspace_id>",
    "formulaId": "<formula_id>",
    "deleteDependentViews": false
})
```

### Returns

`data` is `null`; the confirmation is in `messages`.

---

## Examples

Example — safe delete (fails if dependent views exist):

```js
return await tools.deleteAggregateFormula({
    "workspaceId": "123456789",
    "formulaId": "111111111"
})
```

Example — cascade delete (also deletes all dependent reports/dashboards):

```js
// Only use after confirming with the user that dependent views can be deleted

return await tools.deleteAggregateFormula({
    "workspaceId": "123456789",
    "formulaId": "111111111",
    "deleteDependentViews": true
})
```
