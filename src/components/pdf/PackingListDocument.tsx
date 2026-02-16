import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { InvoiceData } from './InvoiceDocument';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#333', lineHeight: 1.5 },
  
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  companySection: { width: '60%' },
  logoImage: { width: 150, height: 80, objectFit: 'contain', marginBottom: 10 }, 
  companyTitle: { fontSize: 14, fontWeight: 'bold', color: '#1a1a1a' },
  companyText: { fontSize: 9, color: '#555', lineHeight: 1.4 },

  titleSection: { width: '35%', textAlign: 'right' },
  docTitle: { fontSize: 22, fontWeight: 'heavy', color: '#111', textTransform: 'uppercase', marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  metaLabel: { fontWeight: 'bold', marginRight: 5, color: '#555', fontSize: 9 },
  metaValue: { fontSize: 9 },

  // Addresses
  addressContainer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 20, borderTop: '1px solid #eee', paddingTop: 10 },
  addressBox: { width: '45%' },
  sectionTitle: { fontSize: 9, fontWeight: 'bold', color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  addressText: { fontSize: 10, marginBottom: 2 },

  // Table
  table: { marginTop: 10, borderTop: '2px solid #333' },
  tableHeader: { flexDirection: 'row', borderBottom: '1px solid #ccc', backgroundColor: '#f9fafb', paddingVertical: 6 },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #eee', paddingVertical: 8, alignItems: 'center' },
  
  colIndex: { width: '5%', textAlign: 'center', fontSize: 9 },
  colCode: { width: '20%', fontSize: 9 },
  colDesc: { width: '55%', fontSize: 9 },
  colUnit: { width: '10%', textAlign: 'center', fontSize: 9 },
  colQty: { width: '10%', textAlign: 'center', fontWeight: 'bold', fontSize: 10 },

  // Footer
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, borderTop: '1px solid #eee', paddingTop: 10, textAlign: 'center' },
  footerText: { fontSize: 8, color: '#888' },
  
  memoBox: { marginTop: 20, padding: 10, backgroundColor: '#f5f5f5', borderRadius: 4 },
  memoLabel: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  memoText: { fontSize: 9, color: '#444' }
});

const PackingListDocument = ({ data }: { data: InvoiceData }) => {
  // 로고 URL 처리
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/images/logo.png` : '/images/logo.png';

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'dd/MM/yyyy'); } catch { return dateStr; }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companySection}>
            <Image style={styles.logoImage} src={logoUrl} />
            <Text style={styles.companyTitle}>{data.companyName || "Company Name"}</Text>
            <Text style={styles.companyText}>{data.companyAddress}</Text>
            <Text style={styles.companyText}>{data.companyEmail}</Text>
            <Text style={styles.companyText}>{data.companyPhone}</Text>
          </View>
          
          <View style={styles.titleSection}>
            <Text style={styles.docTitle}>PACKING LIST</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Date:</Text>
              <Text style={styles.metaValue}>{formatDate(data.date)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Ref #:</Text>
              <Text style={styles.metaValue}>{data.invoiceNo}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Customer ID:</Text>
              <Text style={styles.metaValue}>{data.customerName.slice(0, 8).toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Addresses */}
        <View style={styles.addressContainer}>
          <View style={styles.addressBox}>
            <Text style={styles.sectionTitle}>Bill To:</Text>
            <Text style={{fontWeight:'bold', marginBottom:2}}>{data.customerName}</Text>
            <Text style={styles.addressText}>{data.address}</Text>
            {/* [수정] 모바일 번호 추가 */}
            {data.customerMobile && (
              <Text style={styles.addressText}>Mobile: {data.customerMobile}</Text>
            )}
          </View>
          <View style={styles.addressBox}>
            <Text style={styles.sectionTitle}>Ship To:</Text>
            <Text style={{fontWeight:'bold', marginBottom:2}}>{data.deliveryName || data.customerName}</Text>
            <Text style={styles.addressText}>{data.deliveryAddress}</Text>
            {/* [수정] 배송 기사를 위해 여기에도 모바일 번호 표시 */}
            {data.customerMobile && (
              <Text style={styles.addressText}>Mobile: {data.customerMobile}</Text>
            )}
          </View>
        </View>

        {/* Item Table (No Prices) */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colIndex}>#</Text>
            <Text style={styles.colCode}>Item Code</Text>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colUnit}>Unit</Text>
            <Text style={styles.colQty}>Quantity</Text>
          </View>

          {data.items.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.colIndex}>{index + 1}</Text>
              <Text style={styles.colCode}>{item.itemCode || "-"}</Text>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colUnit}>{item.unit}</Text>
              <Text style={styles.colQty}>{item.qty}</Text>
            </View>
          ))}
        </View>

        {/* Memo / Notes */}
        {data.memo && (
          <View style={styles.memoBox}>
            <Text style={styles.memoLabel}>Notes / Instructions:</Text>
            <Text style={styles.memoText}>{data.memo}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Received By: ___________________________________    Date: _________________
          </Text>
          <Text style={[styles.footerText, {marginTop: 5}]}>
            Thank you for your business. If you have any questions about this shipment, please contact us.
          </Text>
        </View>

      </Page>
    </Document>
  );
};

export default PackingListDocument;