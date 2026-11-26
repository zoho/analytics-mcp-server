# Code Mode

Every Zoho Analytics operation is an async function in a JavaScript sandbox: `await tools.<toolName>(args)`. Two MCP tools drive it:

1. `get_signature` with `{"tool_names": ["queryData", "createReport"]}` returns the TypeScript signature of each operation: arguments, optionality, descriptions and the **exact type of the returned `data`**. An empty list returns all tool names. Call it before using an operation; there is no need to run an operation just to see what it returns.
2. `execute_code` with `{"code": "..."}` runs the JavaScript.

## Writing the code

- The code is the body of an async function. `return` the final value (JSON-serializable); `console.log` output comes back in `logs`.
- Every call resolves with `{ status, messages, errors, data }`; the result is in `data`. Read `messages` for hints such as truncation.
- Chain, loop and batch many operations in one call. Process large results in code and return only a small summary.
- No network, filesystem, `require`, `fetch` or timers. Limits: 60s, 64 MB, 50 tool calls, 100k chars of output.

## Errors

- A failed operation (validation, unknown name, "name already taken") **rejects** with an `Error`: `message` summarizes it, `error.errors` has the structured errors, `error.messages` the hints. After a successful `await`, `data` is always usable, so no status checks are needed.
- Use `try/catch` to handle a failure and continue, e.g. to skip an item in a loop.
- A timeout or limit does not cancel a request already sent to Zoho Analytics (e.g. an import). Check the state before retrying a write.

## Examples

```js
// Chain: create a workspace, then a table in it
const { data: ws } = await tools.createWorkspace({ workspaceName: "Sales" });
const { data: table } = await tools.createTable({
  workspaceId: ws.workspaceId, tableName: "Orders",
  columnsArr: [{ columnName: "id", dataType: "NUMBER" }],
});
return { workspaceId: ws.workspaceId, tableId: table.tableId };
```

```js
// Parallel calls with per-item error handling, plus a truncation check
const workspaceId = "123";
const counts = await Promise.all(["Sales", "Customers"].map(async (t) => {
  try {
    const { data } = await tools.queryData({ workspaceId, sqlQuery: `SELECT COUNT(*) AS c FROM "${t}"` });
    return { table: t, count: Number(data.rows[0][0]), truncated: data.truncated };
  } catch (e) {
    return { table: t, error: e.message };
  }
}));
return counts;
```
