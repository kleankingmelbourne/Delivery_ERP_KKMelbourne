import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

export interface InvoiceData {
  invoiceNo: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerId?: string;
  customerMobile?: string; 
  deliveryName?: string;
  address: string;
  deliveryAddress?: string;
  memo?: string;
  items: {
    qty: number;
    unit: string;
    description: string;
    itemCode: string; // Vendor Product ID가 들어올 예정
    unitPrice: number;
    amount: number;
  }[];
  subtotal: number;
  gst: number;
  total: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;

  bankName?: string;
  bsb?: string;
  accountNumber?: string;
  
  bank_payid?: string; 

  companyName?: string;
  companyAbn?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  invoiceInfo?: string;
  title?: string;
}

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#333' },
  topSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'flex-start' },
  topLeftColumn: { flexDirection: 'column', width: '55%' },
  topRightColumn: { flexDirection: 'column', width: '40%', alignItems: 'flex-end' },
  logoImage: { width: 200, height: 100, objectFit: 'contain', marginTop: -20, marginLeft: -20 },
  companyInfo: { marginTop: 0, textAlign: 'left', fontSize: 9, lineHeight: 1.5 },
  companyTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 3, color: '#000' },
  invoiceDetailsBox: { width: '100%', borderWidth: 1, borderColor: '#ddd', padding: 10, backgroundColor: '#fafafa', marginBottom: 5 },
  invoiceTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 5 },
  
  paymentBox: { width: '100%', borderWidth: 1, borderColor: '#ddd', padding: 10, backgroundColor: '#fafafa' },
  paymentTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 6, textDecoration: 'underline' },
  bankingRow: { flexDirection: 'row', marginBottom: 2 },
  bankingLabel: { width: 60, fontWeight: 'bold', color: '#555' },
  
  separatorLine: { borderBottomWidth: 1, borderBottomColor: '#eee', marginVertical: 4 },
  payIdRow: { flexDirection: 'row', marginTop: 2 },
  payIdLabel: { width: 60, fontWeight: 'bold', color: '#555' }, 

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaLabel: { fontWeight: 'bold', color: '#555' },
  
  addressContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 20, borderTopWidth: 1, borderColor: '#eee', paddingTop: 15, width: '100%' },
  addressColumn: { width: '48%', flexDirection: 'column' },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', color: '#666', marginBottom: 4 },
  nameText: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  addressText: { fontSize: 9, lineHeight: 1.4, color: '#444' },
  memoContainer: { marginBottom: 15, borderWidth: 1, borderColor: '#333', padding: 8, backgroundColor: '#fdfdfd' },
  memoLabel: { fontSize: 9, fontWeight: 'bold', marginBottom: 3, textDecoration: 'underline' },
  memoText: { fontSize: 9, lineHeight: 1.4 },
  tableContainer: { marginTop: 5, marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderColor: '#000', paddingVertical: 8, alignItems: 'center' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8, alignItems: 'center' },
  colQty: { width: '8%', textAlign: 'center' },
  colUnit: { width: '10%', textAlign: 'center' },
  colDesc: { width: '42%', paddingLeft: 5 },
  colItem: { width: '15%', textAlign: 'center' },
  colPrice: { width: '12%', textAlign: 'right' },
  colAmount: { width: '13%', textAlign: 'right', paddingRight: 5 },
  totalSection: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  totalBox: { width: '45%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  
  totalRowBalance: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingVertical: 6, 
    borderTopWidth: 2, 
    borderColor: '#000', 
    marginTop: 4,
    backgroundColor: '#f0f0f0', 
    paddingHorizontal: 4
  },
  
  totalLabel: { fontWeight: 'bold', fontSize: 11 },
  totalValue: { fontWeight: 'bold', fontSize: 11 },
  footerContainer: { marginTop: 30, borderTopWidth: 2, borderColor: '#eee', paddingTop: 15 },
  infoSection: { marginTop: 0, padding: 5 },
  infoText: { fontSize: 8, color: '#555', lineHeight: 1.5, textAlign: 'left' },
});

export const InvoicePage = ({ data }: { data: InvoiceData }) => {
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/images/logo.png` : '/images/logo.png';

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topSection}>
        <View style={styles.topLeftColumn}>
           <Image style={styles.logoImage} src={logoUrl} />
           <View style={styles.companyInfo}>
             <Text style={styles.companyTitle}>{data.companyName || "KLEAN KING"}</Text>
             {data.companyAbn && <Text>ABN: {data.companyAbn}</Text>}
             {data.companyPhone && <Text>TEL: {data.companyPhone}</Text>}
             {data.companyEmail && <Text>E-MAIL: {data.companyEmail}</Text>}
             {data.companyAddress && <Text>ADDR: {data.companyAddress}</Text>}
           </View>
        </View>
        <View style={styles.topRightColumn}>
          <View style={styles.invoiceDetailsBox}>
            <Text style={styles.invoiceTitle}>{data.title || "TAX INVOICE"}</Text>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>INVOICE NO:</Text><Text>{data.invoiceNo}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>DATE:</Text><Text>{data.date}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>DUE DATE:</Text><Text>{data.dueDate}</Text></View>
          </View>
          
          <View style={styles.paymentBox}>
            <Text style={styles.paymentTitle}>How to Pay</Text>
            <View style={styles.bankingRow}><Text style={styles.bankingLabel}>BANK:</Text><Text>{data.bankName || "-"}</Text></View>
            <View style={styles.bankingRow}><Text style={styles.bankingLabel}>BSB:</Text><Text>{data.bsb || "-"}</Text></View>
            <View style={styles.bankingRow}><Text style={styles.bankingLabel}>A/C NO:</Text><Text>{data.accountNumber || "-"}</Text></View>
            
            <View style={styles.separatorLine} />
            <View style={styles.payIdRow}><Text style={styles.payIdLabel}>PayID:</Text><Text>{data.bank_payid || "-"}</Text></View>
          </View>
        </View>
      </View>

      <View style={styles.addressContainer}>
          <View style={styles.addressColumn}>
              <Text style={styles.sectionTitle}>INVOICE TO</Text>
              <Text style={styles.nameText}>{data.customerName}</Text> 
              <Text style={styles.addressText}>{data.address}</Text>
              {data.customerMobile && <Text style={styles.addressText}>Mobile: {data.customerMobile}</Text>}
          </View>
          <View style={styles.addressColumn}>
             <Text style={styles.sectionTitle}>DELIVERY TO</Text>
             <Text style={styles.nameText}>{data.deliveryName || data.customerName}</Text>
             <Text style={styles.addressText}>{data.deliveryAddress || data.address}</Text>
          </View>
      </View>

      {data.memo && (
        <View style={styles.memoContainer}>
          <Text style={styles.memoLabel}>MEMO / NOTES:</Text>
          <Text style={styles.memoText}>{data.memo}</Text>
        </View>
      )}

      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <Text style={styles.colQty}>QTY</Text>
          <Text style={styles.colUnit}>UNIT</Text>
          <Text style={styles.colDesc}>PRODUCT NAME</Text>
          {/* [CHANGE] 헤더 이름을 ITEM -> ID로 변경 */}
          <Text style={styles.colItem}>ID</Text>
          <Text style={styles.colPrice}>PRICE</Text>
          <Text style={styles.colAmount}>AMOUNT</Text>
        </View>
        {data.items.map((item, idx) => (
          <View key={idx} style={styles.tableRow}>
            <Text style={styles.colQty}>{item.qty}</Text>
            <Text style={styles.colUnit}>{item.unit}</Text>
            <Text style={styles.colDesc}>{item.description}</Text>
            {/* 여기 itemCode에 vendor_product_id가 들어옴 */}
            <Text style={styles.colItem}>{item.itemCode}</Text>
            <Text style={styles.colPrice}>${item.unitPrice.toFixed(2)}</Text>
            <Text style={styles.colAmount}>${item.amount.toFixed(2)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.totalSection}>
        <View style={styles.totalBox}>
          <View style={styles.totalRow}><Text>Subtotal</Text><Text>${data.subtotal.toFixed(2)}</Text></View>
          <View style={styles.totalRow}><Text>GST</Text><Text>${data.gst.toFixed(2)}</Text></View>
          <View style={styles.totalRow}><Text>Total (inc GST)</Text><Text>${data.totalAmount.toFixed(2)}</Text></View>
          
          <View style={styles.totalRow}>
              <Text>Received</Text>
              <Text>- ${(data.paidAmount || 0).toFixed(2)}</Text>
          </View>

          <View style={styles.totalRowBalance}>
              <Text style={styles.totalLabel}>BALANCE DUE</Text>
              <Text style={styles.totalValue}>${data.balanceDue.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footerContainer}>
        {data.invoiceInfo && (
          <View style={styles.infoSection}>
            <Text style={styles.infoText}>{data.invoiceInfo}</Text>
          </View>
        )}
      </View>
    </Page>
  );
};

const InvoiceDocument = ({ data }: { data: InvoiceData }) => {
  return (
    <Document>
      <InvoicePage data={data} />
    </Document>
  );
};

export default InvoiceDocument;