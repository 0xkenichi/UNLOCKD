import React from 'react';

interface Column<T> {
  header: string;
  accessorKey: keyof T | ((item: T) => React.ReactNode);
  className?: string;
  align?: 'left' | 'center' | 'right';
}

interface AssetTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  className?: string;
}

export function AssetTable<T>({ 
  data, 
  columns, 
  onRowClick,
  className = '' 
}: AssetTableProps<T>) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-glass">
            {columns.map((column, index) => (
              <th 
                key={index}
                className={`py-4 px-6 text-left text-xs font-bold text-foreground/40 uppercase tracking-widest ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''} ${column.className || ''}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, rowIndex) => (
            <tr 
              key={rowIndex}
              onClick={() => onRowClick?.(item)}
              className={`group border-b border-border-glass/50 hover:bg-surface-hover/50 transition-colors duration-200 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {columns.map((column, colIndex) => (
                <td 
                  key={colIndex}
                  className={`py-5 px-6 text-sm font-medium text-foreground/80 ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''} ${column.className || ''}`}
                >
                  {typeof column.accessorKey === 'function' 
                    ? column.accessorKey(item) 
                    : (item[column.accessorKey] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
