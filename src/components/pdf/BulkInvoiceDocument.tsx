import React from 'react';
import { Document } from '@react-pdf/renderer';
import { InvoicePage, InvoiceData } from './InvoiceDocument';

interface BulkInvoiceProps {
  dataSet: InvoiceData[];
}

export const BulkInvoiceDocument: React.FC<BulkInvoiceProps> = ({ dataSet }) => {
  return (
    <Document>
      {dataSet.map((data, index) => (
        <InvoicePage 
          key={data.invoiceNo || index} 
          data={data}
        />
      ))}
    </Document>
  );
};