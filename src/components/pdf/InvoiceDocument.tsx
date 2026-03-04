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
    itemCode: string;
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
  page: { padding: 30, fontSize: 9, fontFamily: 'NotoSansKR', color: '#333' },
  topSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'flex-start' },
  topLeftColumn: { flexDirection: 'column', width: '60%' }, // ✅ 결제 정보를 위해 폭을 더 넓힘
  topRightColumn: { flexDirection: 'column', width: '40%', alignItems: 'flex-end' },
  logoImage: { width: 200, height: 100, objectFit: 'contain', marginTop: -20, marginLeft: -20 },
  companyInfo: { marginTop: 0, textAlign: 'left', fontSize: 9, lineHeight: 1.5 },
  companyTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 3, color: '#000' },
  
  // ✅ 결제 정보 라인 스타일 수정 (줄바꿈 방지 및 폰트 최적화)
  bankingInfoInline: { 
    marginTop: 4, 
    fontSize: 7.5, // 폰트 크기를 살짝 줄여 한 줄 확보
    color: '#444', 
    borderTopWidth: 1, 
    borderTopColor: '#eee', 
    paddingTop: 2,
    flexDirection: 'row',
    width: '100%' 
  },
  bankingLabel: { fontWeight: 'bold', color: '#000' },

  invoiceDetailsBox: { width: '100%', borderWidth: 1, borderColor: '#ddd', padding: 20, backgroundColor: '#fafafa', marginBottom: 5 },
  invoiceTitle: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 6, borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 4 },
  
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  metaLabel: { fontWeight: 'bold', color: '#555', fontSize: 8 },
  
  addressContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1, marginBottom: 1, borderTopWidth: 1, borderColor: '#eee', paddingTop: 8, width: '100%' },
  addressColumn: { width: '48%', flexDirection: 'column' },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', color: '#666', marginBottom: 10 },
  nameText: { fontSize: 12, fontWeight: 'bold', marginBottom: 6 },
  addressText: { fontSize: 9, lineHeight: 1.4, color: '#444' },
  
  memoContainer: { marginBottom: 5, borderWidth: 1, borderColor: '#333', padding: 8, backgroundColor: '#fdfdfd' },
  memoLabel: { fontSize: 9, fontWeight: 'bold', marginBottom: 3, textDecoration: 'underline' },
  memoText: { fontSize: 9, lineHeight: 1.4 },
  
  tableContainer: { marginTop: 1, marginBottom: 5 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderColor: '#000', paddingVertical: 8, alignItems: 'center' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 8, alignItems: 'center' },
  colQty: { width: '8%', textAlign: 'center' },
  colUnit: { width: '10%', textAlign: 'center' },
  colDesc: { width: '42%', paddingLeft: 5 },
  colItem: { width: '15%', textAlign: 'center' },
  colPrice: { width: '12%', textAlign: 'right' },
  colAmount: { width: '13%', textAlign: 'right', paddingRight: 5 },
  
  totalSection: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  totalBox: { width: '75%' },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 4 },
  
  totalRowBalance: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    paddingVertical: 6, 
    borderTopWidth: 2, 
    borderColor: '#000', 
    marginTop: 4,
    backgroundColor: '#f0f0f0', 
    paddingHorizontal: 4
  },
  
  totalLabel: { fontWeight: 'bold', fontSize: 11 },
  totalValue: { fontWeight: 'bold', fontSize: 11 },
  footerContainer: { marginTop: 5, borderTopWidth: 2, borderColor: '#eee', paddingTop: 5 },
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
             
             {/* ✅ 결제 정보: 텍스트 노드를 하나로 합쳐서 줄바꿈 방지 */}
             <View style={styles.bankingInfoInline}>
               <Text>
                 <Text style={styles.bankingLabel}>HOW TO PAY :   </Text>
                 <Text style={styles.bankingLabel}>BANK: </Text>{data.bankName || "-"}   
                 <Text style={styles.bankingLabel}>   BSB: </Text>{data.bsb || "-"}    
                 <Text style={styles.bankingLabel}>   A/C: </Text>{data.accountNumber || "-"} 
                 <Text style={styles.bankingLabel}>     OR     </Text>
                 <Text style={styles.bankingLabel}>PayID: </Text>{data.bank_payid || "-"}
               </Text>
             </View>
           </View>
        </View>

        <View style={styles.topRightColumn}>
          <View style={styles.invoiceDetailsBox}>
            <Text style={styles.invoiceTitle}>{data.title || "TAX INVOICE"}</Text>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>INVOICE NO:</Text><Text>{data.invoiceNo}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>DATE:</Text><Text>{data.date}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>DUE DATE:</Text><Text>{data.dueDate}</Text></View>
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
          <Text style={styles.memoLabel}>MEMO :</Text>
          <Text style={styles.memoText}>{data.memo}</Text>
        </View>
      )}

      <View style={styles.tableContainer}>
        <View style={styles.tableHeader}>
          <Text style={styles.colQty}>QTY</Text>
          <Text style={styles.colUnit}>UNIT</Text>
          <Text style={styles.colDesc}>PRODUCT NAME</Text>
          <Text style={styles.colItem}>ID</Text>
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
          <View style={styles.totalRow}>
            <Text>         Subtotal  :  ${data.subtotal.toFixed(2)}</Text>
            <Text>         GST  :  ${data.gst.toFixed(2)}</Text>
            <Text>         Total (inc GST)  :  ${data.totalAmount.toFixed(2)}</Text>
            <Text>         Received  :  ${(data.paidAmount || 0).toFixed(2)}</Text>
            </View>
          {/* <View style={styles.totalRow}><Text>GST</Text><Text>${data.gst.toFixed(2)}</Text></View>
          <View style={styles.totalRow}><Text>Total (inc GST)</Text><Text>${data.totalAmount.toFixed(2)}</Text></View>
          
          <View style={styles.totalRow}>
              <Text>Received</Text>
              <Text>- ${(data.paidAmount || 0).toFixed(2)}</Text>
          </View> */}

          <View style={styles.totalRowBalance}>
              <Text style={styles.totalLabel}>BALANCE DUE     </Text>
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