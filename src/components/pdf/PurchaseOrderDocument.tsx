import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

// 데이터 인터페이스 정의
export interface PurchaseOrderData {
  poNumber: string;
  date: string;
  
  // 우리 회사 정보
  companyName: string;
  companyAddress1?: string;
  companyAddress2?: string;
  companySuburb?: string;
  companyState?: string;
  companyPostcode?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAbn?: string;

  // 공급처 정보 (Vendor)
  vendorName: string;
  vendorAddress?: string;
  vendorSuburb?: string;   // [NEW]
  vendorState?: string;    // [NEW]
  vendorPostcode?: string; // [NEW]
  vendorPhone?: string;
  vendorEmail?: string;

  // 배송지 정보
  shipToName: string;
  shipToAddress: string;

  items: {
    description: string;
    vendorProductId?: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    gst?: boolean;
  }[];

  subtotal: number;
  gstTotal: number;
  grandTotal: number;
  
  memo?: string;
}

const styles = StyleSheet.create({
  page: { padding: 30, fontSize: 9, fontFamily: 'Helvetica', color: '#333' },
  topSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'flex-start' },
  topLeftColumn: { flexDirection: 'column', width: '55%' },
  topRightColumn: { flexDirection: 'column', width: '40%', alignItems: 'flex-end' },
  logoImage: { width: 150, height: 80, objectFit: 'contain', marginBottom: 5 },
  companyInfo: { marginTop: 5, textAlign: 'left', fontSize: 9, lineHeight: 1.4 },
  companyTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 2, color: '#000' },
  invoiceDetailsBox: { width: '100%', borderWidth: 1, borderColor: '#ddd', padding: 10, backgroundColor: '#fafafa', marginBottom: 5 },
  invoiceTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 5 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaLabel: { fontWeight: 'bold', color: '#555' },
  addressContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 20, borderTopWidth: 1, borderColor: '#eee', paddingTop: 15, width: '100%' },
  addressColumn: { width: '48%', flexDirection: 'column' },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', color: '#666', marginBottom: 4, textDecoration: 'underline' },
  nameText: { fontSize: 11, fontWeight: 'bold', marginBottom: 4 },
  addressText: { fontSize: 9, lineHeight: 1.4, color: '#444' },
  memoContainer: { marginBottom: 15, borderWidth: 1, borderColor: '#333', padding: 8, backgroundColor: '#fdfdfd' },
  memoLabel: { fontSize: 9, fontWeight: 'bold', marginBottom: 3, textDecoration: 'underline' },
  memoText: { fontSize: 9, lineHeight: 1.4 },
  tableContainer: { marginTop: 5, marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderColor: '#000', paddingVertical: 8, alignItems: 'center' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8, alignItems: 'center' },
  colDesc: { width: '40%', paddingLeft: 5 },
  colCode: { width: '15%', textAlign: 'center' },
  colQty: { width: '10%', textAlign: 'center' },
  colPrice: { width: '15%', textAlign: 'right' },
  colAmount: { width: '20%', textAlign: 'right', paddingRight: 5 },
  totalSection: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  totalBox: { width: '45%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalRowBalance: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 2, borderColor: '#000', marginTop: 4, backgroundColor: '#f0f0f0', paddingHorizontal: 4 },
  totalLabel: { fontWeight: 'bold', fontSize: 11 },
  totalValue: { fontWeight: 'bold', fontSize: 11 },
  footerContainer: { marginTop: 40, borderTopWidth: 1, borderColor: '#eee', paddingTop: 20 },
  signatureSection: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  signatureBox: { width: '40%', borderTopWidth: 1, borderColor: '#333', paddingTop: 5, alignItems: 'center' },
  signatureText: { fontSize: 8, color: '#555', textTransform: 'uppercase' },
});

export const PurchaseOrderPage = ({ data }: { data: PurchaseOrderData }) => {
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/images/logo.png` : '/images/logo.png';

  const companyFullAddress = [
    data.companyAddress1,
    data.companyAddress2,
    data.companySuburb,
    data.companyState,
    data.companyPostcode
  ].filter(Boolean).join(', ');

  // [NEW] Vendor 주소 조합
  const vendorFullAddress = [
    data.vendorAddress,
    data.vendorSuburb,
    data.vendorState,
    data.vendorPostcode
  ].filter(Boolean).join(', ');

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.topSection}>
        <View style={styles.topLeftColumn}>
           <Image style={styles.logoImage} src={logoUrl} />
           <View style={styles.companyInfo}>
              <Text style={styles.companyTitle}>{data.companyName}</Text>
              <Text>{companyFullAddress}</Text>
              {data.companyPhone && <Text>TEL: {data.companyPhone}</Text>}
              {data.companyEmail && <Text>EMAIL: {data.companyEmail}</Text>}
              {data.companyAbn && <Text>ABN: {data.companyAbn}</Text>}
           </View>
        </View>
        <View style={styles.topRightColumn}>
          <View style={styles.invoiceDetailsBox}>
            <Text style={styles.invoiceTitle}>PURCHASE ORDER</Text>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>PO NUMBER:</Text><Text>{data.poNumber}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>DATE:</Text><Text>{data.date}</Text></View>
          </View>
        </View>
      </View>

      <View style={styles.addressContainer}>
          <View style={styles.addressColumn}>
              <Text style={styles.sectionTitle}>VENDOR (SUPPLIER)</Text>
              <Text style={styles.nameText}>{data.vendorName}</Text> 
              {/* [NEW] 상세 주소 표시 */}
              <Text style={styles.addressText}>{vendorFullAddress}</Text>
              {data.vendorEmail && <Text style={styles.addressText}>{data.vendorEmail}</Text>}
              {data.vendorPhone && <Text style={styles.addressText}>{data.vendorPhone}</Text>}
          </View>
          <View style={styles.addressColumn}>
             <Text style={styles.sectionTitle}>SHIP TO</Text>
             <Text style={styles.nameText}>{data.shipToName}</Text>
             <Text style={styles.addressText}>{data.shipToAddress || companyFullAddress}</Text>
          </View>
      </View>

      {data.memo && (
        <View style={styles.memoContainer}>
          <Text style={styles.memoLabel}>NOTES / INSTRUCTIONS:</Text>
          <Text style={styles.memoText}>{data.memo}</Text>
        </View>
      )}

      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <Text style={styles.colDesc}>PRODUCT / DESCRIPTION</Text>
          <Text style={styles.colCode}>ITEM CODE</Text>
          <Text style={styles.colQty}>QTY</Text>
          <Text style={styles.colPrice}>UNIT PRICE</Text>
          <Text style={styles.colAmount}>AMOUNT</Text>
        </View>
        {data.items.map((item, idx) => (
          <View key={idx} style={styles.tableRow}>
            <Text style={styles.colDesc}>{item.description}</Text>
            <Text style={styles.colCode}>{item.vendorProductId || "-"}</Text>
            <Text style={styles.colQty}>{item.quantity}</Text>
            <Text style={styles.colPrice}>${item.unitPrice.toFixed(2)}</Text>
            <Text style={styles.colAmount}>${item.amount.toFixed(2)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.totalSection}>
        <View style={styles.totalBox}>
          <View style={styles.totalRow}><Text>Subtotal</Text><Text>${data.subtotal.toFixed(2)}</Text></View>
          <View style={styles.totalRow}><Text>GST</Text><Text>${data.gstTotal.toFixed(2)}</Text></View>
          <View style={styles.totalRowBalance}>
             <Text style={styles.totalLabel}>TOTAL COST</Text>
             <Text style={styles.totalValue}>${data.grandTotal.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footerContainer}>
        <View style={styles.signatureSection}>
            <View style={styles.signatureBox}>
                <Text style={styles.signatureText}>Authorized By</Text>
            </View>
            <View style={styles.signatureBox}>
                <Text style={styles.signatureText}>Date</Text>
            </View>
        </View>
      </View>
    </Page>
  );
};

const PurchaseOrderDocument = ({ data }: { data: PurchaseOrderData }) => {
  return (
    <Document>
      <PurchaseOrderPage data={data} />
    </Document>
  );
};

export default PurchaseOrderDocument;