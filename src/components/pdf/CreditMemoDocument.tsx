import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';

// 한글 폰트 등록 (Google Fonts CDN 또는 로컬 경로)
// 주의: CDN 속도가 느릴 경우 로컬 파일(/public/fonts/...) 사용 권장
Font.register({
  family: 'NotoSansKR',
  src: '/font/NotoSansKR-Medium.ttf'
});

// 데이터 인터페이스
export interface CreditMemoData {
  id: string;
  date: string;
  customerName: string;
  deliveryName?: string;
  address: string;
  deliveryAddress?: string;
  memo?: string;
  items: {
    qty: number;
    unit: string;
    description: string;
    itemCode: string;
    unitPrice: number;
    amount: number;
  }[];
  subtotal: number;
  gst: number;
  total: number;
  totalAmount: number;
  allocatedAmount: number;
  remainingCredit: number;
  
  // 회사 정보
  bankName?: string;
  bsb?: string;
  accountNumber?: string;
  companyName?: string;
  companyAbn?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyAddress?: string;
  creditInfo?: string;
}

const styles = StyleSheet.create({
  // [중요] 한글 폰트 적용
  page: { padding: 30, fontSize: 9, fontFamily: 'NotoSansKR', color: '#333' },
  
  topSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'flex-start' },
  topLeftColumn: { flexDirection: 'column', width: '55%' },
  topRightColumn: { flexDirection: 'column', width: '40%', alignItems: 'flex-end' },
  logoImage: { width: 200, height: 100, objectFit: 'contain', marginTop: -20, marginLeft: -20 },
  companyInfo: { marginTop: 0, textAlign: 'left', fontSize: 9, lineHeight: 1.5 },
  companyTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 3, color: '#000' },
  
  invoiceDetailsBox: { width: '100%', borderWidth: 1, borderColor: '#ddd', padding: 10, backgroundColor: '#fafafa', marginBottom: 5 },
  creditTitle: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 8, borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 5, color: '#DC2626' },
  
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaLabel: { fontWeight: 'bold', color: '#555' },
  
  addressContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 20, borderTopWidth: 1, borderColor: '#eee', paddingTop: 15, width: '100%' },
  addressColumn: { width: '100%', flexDirection: 'column' },
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
    backgroundColor: '#fff',
    paddingHorizontal: 4
  },
  
  totalLabel: { fontWeight: 'bold', fontSize: 11, color: '#000' },
  totalValue: { fontWeight: 'bold', fontSize: 11, color: '#000' },
  
  footerContainer: { marginTop: 30, borderTopWidth: 2, borderColor: '#eee', paddingTop: 15 },
  infoSection: { marginTop: 0, padding: 5 },
  infoText: { fontSize: 8, color: '#555', lineHeight: 1.5, textAlign: 'left' },
});

export const CreditMemoPage = ({ data }: { data: CreditMemoData }) => {
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
            <Text style={styles.creditTitle}>CREDIT MEMO</Text>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>CREDIT NO:</Text><Text>{data.id}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>DATE:</Text><Text>{data.date}</Text></View>
          </View>
        </View>
      </View>

      <View style={styles.addressContainer}>
          <View style={styles.addressColumn}>
              <Text style={styles.sectionTitle}>CREDIT TO</Text>
              <Text style={styles.nameText}>{data.customerName}</Text> 
              <Text style={styles.addressText}>{data.address}</Text>
          </View>
      </View>

      {data.memo && (
        <View style={styles.memoContainer}>
          <Text style={styles.memoLabel}>MEMO :</Text>
          {/* 한글 폰트 적용 확인 */}
          <Text style={styles.memoText}>{data.memo}</Text>
        </View>
      )}

      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <Text style={styles.colQty}>QTY</Text>
          <Text style={styles.colUnit}>UNIT</Text>
          <Text style={styles.colDesc}>PRODUCT NAME</Text>
          <Text style={styles.colItem}>ITEM</Text>
          <Text style={styles.colPrice}>PRICE</Text>
          <Text style={styles.colAmount}>AMOUNT</Text>
        </View>
        {data.items.map((item, idx) => (
          <View key={idx} style={styles.tableRow}>
            <Text style={styles.colQty}>{item.qty}</Text>
            <Text style={styles.colUnit}>{item.unit}</Text>
            <Text style={styles.colDesc}>{item.description}</Text>
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
          
          <View style={styles.totalRowBalance}>
             <Text style={styles.totalLabel}>CREDIT TOTAL</Text>
             <Text style={styles.totalValue}>${data.totalAmount.toFixed(2)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.footerContainer}>
        <View style={styles.infoSection}>
           <Text style={styles.infoText}>{data.creditInfo || "This credit note can be applied to future invoices. Thank you."}</Text>
        </View>
      </View>
    </Page>
  );
};

const CreditMemoDocument = ({ data }: { data: CreditMemoData }) => (
  <Document>
    <CreditMemoPage data={data} />
  </Document>
);

export default CreditMemoDocument;