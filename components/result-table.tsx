import type { QueryResult } from "@/lib/flow-types";
import { formatResultValue, isNumericResultValue } from "@/lib/result-format";

type ResultTableData = Pick<QueryResult, "columns" | "columnKinds" | "rows" | "totalRows">;

export function ResultTable({ result, overflowNote }: { result: ResultTableData; overflowNote: string }) {
  return (
    <>
      <div className="table-wrap" role="region" aria-label="処理結果" tabIndex={0}>
        <table>
          <thead><tr>{result.columns.map((column) => <th className={result.columnKinds[column] === "number" ? "numeric-cell" : undefined} key={column}>{column}</th>)}</tr></thead>
          <tbody>{result.rows.map((row, index) => <tr key={index}>{result.columns.map((column) => {
            const value = row[column];
            const kind = result.columnKinds[column];
            return <td className={isNumericResultValue(value, kind) ? "numeric-cell" : undefined} key={column}>{formatResultValue(value, kind)}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
      {result.totalRows > 100 && <p className="table-note">{overflowNote}</p>}
    </>
  );
}
