import { getTableName, sql, type Column, type SQL } from 'drizzle-orm';

/**
 * A column written out as "table"."column", for the outer side of a correlated
 * subquery. Drizzle leaves column names bare in a select over a single table, so
 * `where ${items.collectionId} = ${collections.id}` inside a subquery over items
 * becomes `where "collection_id" = "id"`, and that "id" is the item's own id.
 */
export function outer(column: Column): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}
