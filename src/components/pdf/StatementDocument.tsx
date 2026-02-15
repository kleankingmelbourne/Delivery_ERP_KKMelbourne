import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';

export interface StatementTransaction {
  id: string;
  date: string;
  type: 'Invoice' | 'Payment' | 'Credit';
  reference: string;
  amount: number;     
  credit: number;     
  balance?: number;   
  dueDate?: string; // 이미 포함되어 있음
}

export interface StatementAgeing {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

export interface StatementData {
  customerName: string;
  startDate: string;
  endDate: string;
  openingBalance: number; 
  transactions: StatementTransaction[];
  
  customerId?: string;
  customerAddress?: string;

  ageing: StatementAgeing;

  companyName?: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyWebsite?: string; 
  statementInfo?: string;  
  
  bankName?: string;
  bsb?: string;
  accountNumber?: string;
  bank_payid?: string;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 9, color: '#333' },
  
  // Header with Logo
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  companySection: { width: '50%' },
  logoImage: { width: 200, height: 100, objectFit: 'contain', marginTop: -20, marginLeft: -20 }, 
  companyTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 4, color: '#1a1a1a' },
  companyText: { fontSize: 9, lineHeight: 1.4, color: '#555' },
  
  statementBox: { width: '40%', border: '1px solid #ddd', padding: 10, backgroundColor: '#fafafa', height: 90 },
  statementTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', borderBottom: '1px solid #ddd', paddingBottom: 5 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaLabel: { fontWeight: 'bold', color: '#555' },

  // Bill To
  billToSection: { marginTop: 0, marginBottom: 0, padding: 10, borderTop: '1px solid #eee', borderBottom: '1px solid #eee' },
  sectionLabel: { fontSize: 8, color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  customerName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  customerDetail: { fontSize: 9, color: '#444', lineHeight: 1.4 },

  // Table
  table: { marginTop: 20 },
  tableHeader: { flexDirection: 'row', borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 6, backgroundColor: '#f9f9f9', paddingTop: 6 },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #eee', paddingVertical: 6, alignItems: 'center' },
  
  // [수정] Due Date 컬럼 추가 및 전체 너비 재조정 (Total 100%)
  colDate: { width: '13%' },
  colRef: { width: '20%' }, 
  colDesc: { width: '10%' }, 
  colDebit: { width: '14%', textAlign: 'right' },  
  colCredit: { width: '14%', textAlign: 'right' }, 
  colBalance: { width: '15%', textAlign: 'right' },
  colDueDate: { width: '14%', textAlign: 'center' }, // [NEW] Due Date 컬럼

  // Ageing Table Styles
  ageingContainer: { marginTop: 20, marginBottom: 10, border: '1px solid #ddd' },
  ageingHeader: { flexDirection: 'row', backgroundColor: '#859e77', paddingVertical: 6 },
  ageingHeaderCell: { flex: 1, color: '#fff', fontSize: 8, fontWeight: 'bold', textAlign: 'center' },
  ageingRow: { flexDirection: 'row', paddingVertical: 8, backgroundColor: '#fff' },
  ageingCell: { flex: 1, fontSize: 9, textAlign: 'center', color: '#333' },

  // Footer & Payment Info
  footerSection: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  paymentInfo: { width: '100%', padding: 10, color: '#fff', backgroundColor: '#859e77', borderRadius: 4, marginTop: 10 },
  
  bottomInfo: { marginTop: 30, borderTop: '1px solid #859e77', paddingTop: 10, textAlign: 'left' },
  bottomText: { fontSize: 8, color: '#666', lineHeight: 1.5 },
});

const StatementDocument = ({ data }: { data: StatementData }) => {
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/images/logo.png` : '/images/logo.png';
  
  let runningBalance = data.openingBalance;
  
  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'dd/MM/yyyy'); } catch { return dateStr; }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.companySection}>
            <Image style={styles.logoImage} src={logoUrl} />
            <Text style={styles.companyTitle}>{data.companyName || "KLEAN KING"}</Text>
            <Text style={styles.companyText}>{data.companyAddress}</Text>
            <Text style={styles.companyText}>{data.companyEmail}</Text>
            <Text style={styles.companyText}>{data.companyPhone}</Text>
            {data.companyWebsite && <Text style={styles.companyText}>{data.companyWebsite}</Text>}
          </View>
          <View style={styles.statementBox}>
            <Text style={styles.statementTitle}>STATEMENT</Text>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Date:</Text><Text>{formatDate(new Date().toISOString())}</Text></View>
            <View style={styles.metaRow}><Text style={styles.metaLabel}>Period:</Text><Text>{formatDate(data.startDate)} - {formatDate(data.endDate)}</Text></View>
          </View>
        </View>

        {/* Bill To */}
        <View style={styles.billToSection}>
          <Text style={styles.sectionLabel}>Bill To</Text>
          <Text style={styles.customerName}>{data.customerName}</Text>
          {data.customerAddress && <Text style={styles.customerDetail}>{data.customerAddress}</Text>}
        </View>

        {/* Transaction Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDate, { fontWeight: 'bold' }]}>Date</Text>
            <Text style={[styles.colRef, { fontWeight: 'bold' }]}>Reference</Text>
            <Text style={[styles.colDesc, { fontWeight: 'bold' }]}>Type</Text>
            <Text style={[styles.colDebit, { fontWeight: 'bold' }]}>Charges</Text>
            <Text style={[styles.colCredit, { fontWeight: 'bold' }]}>Credits</Text>
            <Text style={[styles.colBalance, { fontWeight: 'bold' }]}>Balance</Text>
            {/* [추가] Due Date 헤더 */}
            <Text style={[styles.colDueDate, { fontWeight: 'bold' }]}>Due Date</Text>
          </View>

          {/* Opening Balance Row */}
          <View style={[styles.tableRow, { backgroundColor: '#f9fafb' }]}>
            <Text style={styles.colDate}>{formatDate(data.startDate)}</Text>
            <Text style={styles.colRef}>OPENING BALANCE</Text>
            <Text style={styles.colDesc}>B/F</Text>
            <Text style={styles.colDebit}>-</Text>
            <Text style={styles.colCredit}>-</Text>
            <Text style={styles.colBalance}>${data.openingBalance.toFixed(2)}</Text>
            {/* Opening Balance Row의 Due Date는 비워둠 */}
            <Text style={styles.colDueDate}>-</Text>
          </View>

          {/* Transactions */}
          {data.transactions.map((t, idx) => {
            runningBalance += (t.amount - t.credit);
            const displayRef = t.reference.length > 25 ? t.reference.slice(0, 25) + '...' : t.reference;

            return (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.colDate}>{formatDate(t.date)}</Text>
                <Text style={styles.colRef}>{displayRef}</Text>
                <Text style={styles.colDesc}>{t.type}</Text>
                
                <Text style={styles.colDebit}>
                    {(t.amount > 0 || t.type === 'Invoice') ? `$${t.amount.toFixed(2)}` : '-'}
                </Text>
                
                <Text style={styles.colCredit}>
                    {t.credit > 0 ? `$${t.credit.toFixed(2)}` : '-'}
                </Text>
                <Text style={styles.colBalance}>${runningBalance.toFixed(2)}</Text>
                
                {/* [추가] Due Date 데이터 표시 */}
                <Text style={styles.colDueDate}>
                    {t.dueDate ? formatDate(t.dueDate) : '-'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Ageing Analysis Bar */}
        <Text style={{marginBottom: 4}}>OVERDUE INFORMATION</Text>
        <View style={styles.ageingContainer}>
            <View style={styles.ageingHeader}>
                <Text style={styles.ageingHeaderCell}>Current</Text>
                <Text style={styles.ageingHeaderCell}>1-30 Days</Text>
                <Text style={styles.ageingHeaderCell}>31-60 Days</Text>
                <Text style={styles.ageingHeaderCell}>61-90 Days</Text>
                <Text style={styles.ageingHeaderCell}>Over 90 Days</Text>
                <Text style={styles.ageingHeaderCell}>Statement Amount</Text>
            </View>
            <View style={styles.ageingRow}>
                <Text style={styles.ageingCell}>{formatCurrency(data.ageing.current)}</Text>
                <Text style={styles.ageingCell}>{formatCurrency(data.ageing.days30)}</Text>
                <Text style={styles.ageingCell}>{formatCurrency(data.ageing.days60)}</Text>
                <Text style={styles.ageingCell}>{formatCurrency(data.ageing.days90)}</Text>
                <Text style={styles.ageingCell}>{formatCurrency(data.ageing.over90)}</Text>
                <Text style={[styles.ageingCell, { fontWeight: 'bold' }]}>{formatCurrency(data.ageing.total)}</Text>
            </View>
        </View>

        {/* Footer Section */}
        <View style={styles.footerSection}>
           <View style={styles.paymentInfo}>
              <Text style={{ fontWeight: 'bold', marginBottom: 4, textDecoration: 'underline' }}>How to pay</Text>
              <Text>Bank Transfer</Text>
              <Text>Bank: {data.bankName || "St George"}</Text>
              <Text>BSB: {data.bsb || "-"}</Text>
              <Text>Acc: {data.accountNumber || "-"}</Text>
              <Text style={{ marginTop: 6}}>or</Text>
              <Text style={{ marginTop: 6}}>PayID: {data.bank_payid || "-"}</Text>
              <Text style={{ marginTop: 6, fontSize: 8 }}>Please quote Invoice # or Customer Name</Text>
           </View>
        </View>
        
        {/* Footer Info */}
        {data.statementInfo && (
            <View style={styles.bottomInfo}>
                <Text style={styles.bottomText}>{data.statementInfo}</Text>
            </View>
        )}

      </Page>
    </Document>
  );
};

export default StatementDocument;