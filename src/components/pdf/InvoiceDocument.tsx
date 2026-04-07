"use client";

import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

export interface InvoiceData {
  invoiceNo: string;
  date: string;
  dueDate: string;
  customerName: string;
  customerId?: string;
  customerMobile?: string; 
  contactName?: string; 
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
  page: { padding: 30, fontSize: 9, fontFamily: 'NotoSansKR', color: '#000' },
  topSection: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5, alignItems: 'flex-start' }, 
  topLeftColumn: { flexDirection: 'column', width: '55%' }, 
  topRightColumn: { flexDirection: 'column', width: '40%', alignItems: 'flex-end' },
  logoImage: { width: 200, height: 100, objectFit: 'contain', marginTop: -20, marginLeft: -20 },
  companyInfo: { marginTop: -10, textAlign: 'left', fontSize: 9, lineHeight: 1.4, color: '#000' },
  companyTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 3, color: '#000' },

  invoiceDetailsBox: { width: '100%', borderWidth: 1, borderColor: '#000', padding: 10, backgroundColor: '#fff', marginBottom: 5, marginTop: 15 }, 
  invoiceTitle: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 4, borderBottomWidth: 1, borderColor: '#000', paddingBottom: 4 },
  
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  metaLabel: { fontWeight: 'bold', color: '#000', fontSize: 8 }, 
  
  addressContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1, marginBottom: 12, borderTopWidth: 1, borderColor: '#000', paddingTop: 6, width: '100%' },
  addressColumn: { width: '48%', flexDirection: 'column' },
  sectionTitle: { fontSize: 10, fontWeight: 'bold', color: '#000', marginBottom: 6 }, 
  nameText: { fontSize: 11, fontWeight: 'bold', marginBottom: 4, color: '#000' },
  addressText: { fontSize: 9, lineHeight: 1.3, color: '#000' }, 
  
  contactRow: { flexDirection: 'row', marginTop: 4, justifyContent: 'flex-start' },
  contactCol: { width: '50%' },

  // 🚀 [변경] 메모 컨테이너 스타일 (위아래 여백 조정 및 배경색)
  memoContainer: { marginTop: 15, marginBottom: 5, borderWidth: 1, borderColor: '#000', backgroundColor: '#fff' },
  // 🚀 [변경] 메모 라벨을 반전 효과(검정 배경, 흰 글씨)로 강조
  memoLabelContainer: { backgroundColor: '#000', paddingVertical: 4, paddingHorizontal: 6 },
  memoLabel: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  memoTextContainer: { padding: 8 },
  memoText: { fontSize: 9, lineHeight: 1.3, color: '#000' },
  
  tableContainer: { marginTop: 1, marginBottom: 5 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderColor: '#000', paddingVertical: 4, alignItems: 'center' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#aaa', paddingVertical: 3, alignItems: 'center', fontSize: 7.5, color: '#000' },
  
  colQty: { width: '8%', textAlign: 'center', fontWeight: 'bold' },
  colUnit: { width: '10%', textAlign: 'center' },
  colDesc: { width: '42%', paddingLeft: 5 },
  colItem: { width: '15%', textAlign: 'center' },
  colPrice: { width: '12%', textAlign: 'right' },
  colAmount: { width: '13%', textAlign: 'right', paddingRight: 5, fontWeight: 'bold' },
  
  bottomSection: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'flex-start' },
  
  paymentBox: { width: '48%', borderWidth: 1, borderColor: '#000', padding: 10, backgroundColor: '#fafafa' },
  paymentTitle: { fontSize: 10, fontWeight: 'bold', marginBottom: 6, color: '#000' },
  paymentRow: { flexDirection: 'row', marginBottom: 3 },
  paymentLabel: { width: 40, fontSize: 9, fontWeight: 'bold', color: '#000' },
  paymentValue: { fontSize: 9, color: '#000' },

  totalsCard: { width: '48%', borderWidth: 1, borderColor: '#000', padding: 10, backgroundColor: '#fff' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  totalsLabel: { fontSize: 9, color: '#000' },
  totalsValue: { fontSize: 9, fontWeight: 'bold', color: '#000' },
  totalsDivider: { borderTopWidth: 1, borderColor: '#ccc', marginVertical: 2 },
  
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, marginTop: 4, borderTopWidth: 2, borderColor: '#000', backgroundColor: '#f0f0f0', paddingHorizontal: 6 },
  balanceLabel: { fontSize: 11, fontWeight: 'bold', color: '#000' },
  balanceValue: { fontSize: 11, fontWeight: 'bold', color: '#000' },

  footerContainer: { marginTop: 10, borderTopWidth: 1, borderColor: '#000', paddingTop: 5 },
  infoSection: { marginTop: 0, padding: 0 },
  infoText: { fontSize: 8, color: '#000', lineHeight: 1.3, textAlign: 'left' }, 

  pageFooterText: {
    position: 'absolute',
    bottom: 20, 
    left: 30,
    right: 30,
    fontSize: 8, 
    color: '#666', 
    textAlign: 'center',
    borderTopWidth: 0.5,
    borderColor: '#eee',
    paddingTop: 5,
  }
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
        </View>
      </View>

      <View style={styles.addressContainer}>
          <View style={styles.addressColumn}>
              <Text style={styles.sectionTitle}>INVOICE TO</Text>
              <Text style={styles.nameText}>{data.customerName}</Text> 
              <Text style={styles.addressText}>{data.address}</Text>
              
              <View style={styles.contactRow}>
                <View style={styles.contactCol}>
                  <Text style={styles.addressText}>Mobile: {data.customerMobile || " "}</Text>
                </View>
                <View style={styles.contactCol}>
                  <Text style={styles.addressText}>Contact: {data.contactName || " "}</Text>
                </View>
              </View>
          </View>
          
          <View style={styles.addressColumn}>
              <Text style={styles.sectionTitle}>DELIVERY TO</Text>
              <Text style={styles.nameText}>{data.deliveryName || data.customerName}</Text>
              <Text style={styles.addressText}>{data.deliveryAddress || data.address}</Text>
          </View>
      </View>

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

      {/* 🚀 [해결] 하단 전체(결제/합계 정보 + 메로 + 약관 정보)를 wrap={false} 뷰로 감싸서 페이지 경계선에서 쪼개지지 않도록 강제 방어! */}
      <View wrap={false}>
        <View style={styles.bottomSection}>
          {/* 왼쪽: HOW TO PAY */}
          <View style={styles.paymentBox}>
            <Text style={styles.paymentTitle}>HOW TO PAY</Text>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>BANK:</Text>
              <Text style={styles.paymentValue}>{data.bankName || "-"}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>BSB:</Text>
              <Text style={styles.paymentValue}>{data.bsb || "-"}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>A/C:</Text>
              <Text style={styles.paymentValue}>{data.accountNumber || "-"}</Text>
            </View>
            <View style={styles.paymentRow}>
              <Text style={styles.paymentLabel}>PayID:</Text>
              <Text style={styles.paymentValue}>{data.bank_payid || "-"}</Text>
            </View>
          </View>

          {/* 오른쪽: 금액 합계 */}
          <View style={styles.totalsCard}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>${data.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>GST</Text>
              <Text style={styles.totalsValue}>${data.gst.toFixed(2)}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total (inc GST)</Text>
              <Text style={styles.totalsValue}>${data.totalAmount.toFixed(2)}</Text>
            </View>
            
            <View style={styles.totalsDivider} />
            
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Received</Text>
              <Text style={styles.totalsValue}>${(data.paidAmount || 0).toFixed(2)}</Text>
            </View>

            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>BALANCE DUE</Text>
              <Text style={styles.balanceValue}>${data.balanceDue.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* 🚀 [변경] 테이블 위에서 여기(금액 박스와 Footer 사이)로 위치 이동 */}
        {data.memo && (
          <View style={styles.memoContainer}>
            <View style={styles.memoLabelContainer}>
              <Text style={styles.memoLabel}>MEMO / NOTES</Text>
            </View>
            <View style={styles.memoTextContainer}>
              <Text style={styles.memoText}>{data.memo}</Text>
            </View>
          </View>
        )}

        <View style={styles.footerContainer}>
          {data.invoiceInfo && (
            <View style={styles.infoSection}>
              <Text style={styles.infoText}>{data.invoiceInfo}</Text>
            </View>
          )}
        </View>
      </View>

      <Text 
        style={styles.pageFooterText} 
        fixed 
        render={({ pageNumber, totalPages }) => (
          totalPages > 1 
            ? `${data.invoiceNo}    |    ${data.customerName}    |    Page ${pageNumber} of ${totalPages}` 
            : ""
        )} 
      />
    </Page>
  );
};

const InvoiceDocument = ({ data }: { data: InvoiceData }) => {
  return (
    <Document title={`Invoice_${data.invoiceNo}`}>
      <InvoicePage data={data} />
    </Document>
  );
};

export default InvoiceDocument;