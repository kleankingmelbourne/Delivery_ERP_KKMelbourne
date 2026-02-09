import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';

export interface StatementTransaction {
  id: string;
  date: string;
  type: 'Invoice' | 'Payment';
  reference: string;
  amount: number;     
  credit: number;     
  balance?: number;   
  dueDate?: string;
  status?: string; 
}

export interface StatementData {
  customerName: string;
  startDate: string;
  endDate: string;
  openingBalance: number; 
  transactions: StatementTransaction[];
  
  customerId?: string;
  customerAddress?: string;

  amountOverdue: number;

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
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  companySection: { width: '50%' },
  logoImage: { width: 200, height: 100, objectFit: 'contain', marginTop: -20, marginLeft: -20 }, 
  companyTitle: { fontSize: 11, fontWeight: 'bold', marginBottom: 4, color: '#1a1a1a' },
  companyText: { fontSize: 9, lineHeight: 1.4, color: '#555' },
  
  statementBox: { width: '40%', border: '1px solid #ddd', padding: 10, backgroundColor: '#fafafa', height: 90 },
  statementTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, textAlign: 'center', borderBottom: '1px solid #ddd', paddingBottom: 5 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  metaLabel: { fontWeight: 'bold', color: '#555' },

  // Bill To
  billToSection: { marginTop: 10, marginBottom: 20, padding: 10, borderTop: '1px solid #eee', borderBottom: '1px solid #eee' },
  sectionLabel: { fontSize: 8, color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  customerName: { fontSize: 12, fontWeight: 'bold', marginBottom: 2 },
  customerDetail: { fontSize: 9, color: '#444', lineHeight: 1.4 },

  // Table
  table: { marginTop: 10 },
  tableHeader: { flexDirection: 'row', borderBottom: '1px solid #000', paddingBottom: 6, marginBottom: 6, backgroundColor: '#f9f9f9', paddingTop: 6 },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #eee', paddingVertical: 6, alignItems: 'center' },
  
  colDate: { width: '12%' },
  colRef: { width: '20%' }, 
  colDesc: { width: '10%' }, 
  colDebit: { width: '13%', textAlign: 'right' },  
  colCredit: { width: '13%', textAlign: 'right' }, 
  colBalance: { width: '17%', textAlign: 'right' },
  colStatus: { width: '15%', textAlign: 'center' }, 

  // Footer & Totals
  footerSection: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  paymentInfo: { width: '45%', padding: 10, backgroundColor: '#f0fdf4', borderRadius: 4 },
  
  totalsContainer: { width: '50%', flexDirection: 'column', alignItems: 'flex-end' },
  
  overdueBox: { 
    border: '1px solid #fecaca', backgroundColor: '#fef2f2', padding: 8, borderRadius: 4, 
    marginBottom: 10, width: '100%', flexDirection: 'row', justifyContent: 'space-between' 
  },
  
  totalBox: { width: '100%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottom: '1px solid #eee' },
  totalRowFinal: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTop: '2px solid #000', marginTop: 5 },
  totalLabel: { fontWeight: 'bold' },
  totalValue: { fontWeight: 'bold', fontSize: 12 },
  
  bottomInfo: { marginTop: 40, borderTop: '1px solid #eee', paddingTop: 10, textAlign: 'left' },
  bottomText: { fontSize: 8, color: '#666', lineHeight: 1.5 },
});

const StatementDocument = ({ data }: { data: StatementData }) => {
  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/images/logo.png` : '/images/logo.png';
  
  let runningBalance = data.openingBalance;
  const finalBalance = data.transactions.reduce((acc, t) => acc + t.amount - t.credit, data.openingBalance);

  const formatDate = (dateStr: string) => {
    try { return format(new Date(dateStr), 'dd/MM/yyyy'); } catch { return dateStr; }
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

        {/* [FIXED] Customer Section with Address */}
        <View style={styles.billToSection}>
          <Text style={styles.sectionLabel}>Bill To</Text>
          <Text style={styles.customerName}>{data.customerName}</Text>
          {/* [FIXED] 주소 표시 추가 */}
          {data.customerAddress && <Text style={styles.customerDetail}>{data.customerAddress}</Text>}
        </View>

        {/* Table Section */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDate, { fontWeight: 'bold' }]}>Date</Text>
            <Text style={[styles.colRef, { fontWeight: 'bold' }]}>Reference</Text>
            <Text style={[styles.colDesc, { fontWeight: 'bold' }]}>Type</Text>
            <Text style={[styles.colDebit, { fontWeight: 'bold' }]}>Charges</Text>
            <Text style={[styles.colCredit, { fontWeight: 'bold' }]}>Credits</Text>
            <Text style={[styles.colBalance, { fontWeight: 'bold' }]}>Balance</Text>
            <Text style={[styles.colStatus, { fontWeight: 'bold' }]}>Status</Text>
          </View>

          {/* Opening Balance Row */}
          <View style={[styles.tableRow, { backgroundColor: '#f9fafb' }]}>
            <Text style={styles.colDate}>{formatDate(data.startDate)}</Text>
            <Text style={styles.colRef}>OPENING BALANCE</Text>
            <Text style={styles.colDesc}>B/F</Text>
            <Text style={styles.colDebit}>-</Text>
            <Text style={styles.colCredit}>-</Text>
            <Text style={styles.colBalance}>${data.openingBalance.toFixed(2)}</Text>
            <Text style={styles.colStatus}>-</Text>
          </View>

          {/* Transactions */}
          {data.transactions.map((t, idx) => {
            runningBalance += (t.amount - t.credit);
            const displayRef = t.reference.length > 20 ? t.reference.slice(0, 20) + '...' : t.reference;

            const isOverdue = t.status === 'Overdue';
            const statusColor = isOverdue ? '#dc2626' : (t.status === 'Paid' ? '#16a34a' : '#555');

            return (
              <View key={idx} style={styles.tableRow}>
                <Text style={styles.colDate}>{formatDate(t.date)}</Text>
                <Text style={styles.colRef}>{displayRef}</Text>
                <Text style={styles.colDesc}>{t.type}</Text>
                <Text style={styles.colDebit}>
                    {t.amount > 0 ? `$${t.amount.toFixed(2)}` : '-'}
                </Text>
                <Text style={styles.colCredit}>
                    {t.credit > 0 ? `$${t.credit.toFixed(2)}` : '-'}
                </Text>
                <Text style={styles.colBalance}>${runningBalance.toFixed(2)}</Text>
                <Text style={[styles.colStatus, { color: statusColor, fontSize: 8 }]}>
                    {t.status || '-'}
                </Text>
              </View>
            );
          })}
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
              <Text style={{ marginTop: 6, fontSize: 8, color: '#666' }}>Please quote Invoice # or Customer Name</Text>
           </View>

           <View style={styles.totalsContainer}>
              {/* Overdue Box */}
              {data.amountOverdue > 0 && (
                  <View style={styles.overdueBox}>
                      <Text style={{ color: '#991b1b', fontWeight: 'bold' }}>OVERDUE AMOUNT:</Text>
                      <Text style={{ color: '#991b1b', fontWeight: 'bold' }}>${data.amountOverdue.toFixed(2)}</Text>
                  </View>
              )}

              {/* Totals */}
              <View style={styles.totalBox}>
                  <View style={styles.totalRow}>
                    <Text>Current Charges:</Text>
                    <Text>${data.transactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text>Less Payments:</Text>
                    <Text>-${data.transactions.reduce((sum, t) => sum + t.credit, 0).toFixed(2)}</Text>
                  </View>
                  <View style={styles.totalRowFinal}>
                    <Text style={styles.totalLabel}>Total Amount Due:</Text>
                    <Text style={styles.totalValue}>${finalBalance.toFixed(2)}</Text>
                  </View>
              </View>
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