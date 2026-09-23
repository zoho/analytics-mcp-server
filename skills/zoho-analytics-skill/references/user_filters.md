# User Filters

User filters are interactive filter widgets exposed to viewers of a report. Unlike static filters (see [Filters](./filters.md)) which are pre-applied by the report creator and fixed, user filters allow report viewers to dynamically filter the data themselves through interactive UI controls.

**Key difference:**
- **Static filters** (`filters`): Pre-applied by report creator; viewers see already-filtered data; not changeable by viewers.
- **User filters** (`userFilters`): Interactive widgets (dropdowns, sliders, date pickers) that viewers can adjust to explore different data slices.

---

## When to Use User Filters

Use user filters when:
- You want report viewers to interactively explore data without creating multiple report versions
- You need to provide self-service analytics capabilities
- Different viewers need different data perspectives (e.g., each sales rep viewing their own region)
- You want to enable ad-hoc filtering without modifying the report definition

Common use cases:
- Date range selectors for time-series reports
- Region/category dropdowns for segmented analysis
- Top-N sliders for ranking reports
- Multi-select lists for flexible data exploration

---

## Loading Detailed Reference

User filters can be added during report creation or as standalone operations on existing reports.

### Creating User Filters (During Report Creation)

If you need to add user filters when creating a new report, load:

→ **[User Filters — Creation](./user_filters_creation.md)**

This covers:
- User filter object structure (required/optional fields)
- Operations by column type (dimension, measure, date)
- Component types (singleSelect, multiSelect, slider)
- Filter types and behaviour settings
- Complete examples for all filter patterns
- Using userFilters with `createReport`

**When to load:**
- Adding user filters to a new chart, pivot, or summary report
- Understanding filter configuration syntax
- Learning which fields are required for different column types

---

### Managing User Filters (Operations on Existing Reports)

If you need to list, add, update, or delete user filters on an existing report, load:

→ **[User Filters — Operations](./user_filters_operations.md)**

This covers:
- `listUserFilters` — retrieve all user filters for a report
- `addUserFilter` — add a new user filter to an existing report
- `updateUserFilter` — modify an existing user filter
- `deleteUserFilter` — remove a user filter from a report
- Using `updateReport` to replace all user filters at once

**When to load:**
- Inspecting existing user filters on a report
- Adding a new user filter to an existing report
- Modifying or removing user filters

---

## Quick Reference

### User Filter Required Fields

| Field | Type | When Required |
|-------|------|---------------|
| `columnName` | string | Always |
| `tableName` | string | Always (mandatory for user filters) |
| `operation` | string | Always |
| `compType` | string | All operations **except** `dateRange` |
| `filterType` | string | Required for **measures** and **date actual/seasonal** |

### Common Patterns

**Dimension filter (dropdown):**
```json
{
    "columnName": "Region",
    "tableName": "Sales Data",
    "operation": "actual",
    "compType": "multiSelect"
}
```

**Date range picker:**
```json
{
    "columnName": "Order Date",
    "tableName": "Sales Data",
    "operation": "dateRange"
}
```

**Top-N ranking slider:**
```json
{
    "columnName": "Sales Amount",
    "tableName": "Sales Data",
    "operation": "sum",
    "compType": "slider",
    "filterType": "ranking"
}
```

For complete syntax, examples, and operation-specific details, load the appropriate detailed reference file above.
