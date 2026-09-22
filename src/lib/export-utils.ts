'use client';

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import type { Sale, Customer, SaleItem, Expense, ExpenseItem } from '@/lib/types';

// Extend the jsPDF type to include the autoTable method
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

function replacer(key: any, value: any) {
  return value === null || value === undefined ? '' : value;
}

const unitOptions = {
  'Butir': 1,
  'Pack': 10,
  'Tray': 30,
};

/**
 * Exports data to a CSV file.
 * @param data The data to export (array of objects).
 * @param headers The headers for the CSV file (array of strings).
 * @param filename The name of the file to save.
 */
export const exportToCSV = (data: any[], headers: string[], filename: string) => {
  const dataKeys = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => dataKeys.map(key => JSON.stringify(row[key], replacer)).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.href) {
    URL.revokeObjectURL(link.href);
  }
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};


/**
 * Exports data to an XLSX file.
 * @param data The data to export (array of objects).
 * @param headers The headers for the XLSX file (array of strings).
 * @param filename The name of the file to save.
 */
export const exportToXLSX = (data: any[], headers: string[], filename: string) => {
  // The data is already in the correct format { Header: value }. No need to transform.
  const worksheet = XLSX.utils.json_to_sheet(data);
  // Manually set headers if they are different from data keys
  XLSX.utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  XLSX.writeFile(workbook, filename);
};


/**
 * Exports data to a PDF file.
 * @param data The data to export (array of objects).
 * @param headers The headers for the PDF table (array of strings).
 * @param filename The name of the file to save.
 * @param title The title of the document.
 */
export const exportToPDF = (data: any[], headers: string[], filename: string, title: string) => {
  const doc = new jsPDF();

  doc.text(title, 14, 15);
  
  const dataKeys = Object.keys(data[0]);
  const body = data.map(row => dataKeys.map(key => {
      const value = row[key];
      return value !== undefined && value !== null ? value.toString() : '';
  }));

  doc.autoTable({
    startY: 20,
    head: [headers],
    body: body,
  });

  doc.save(filename);
};

export const generateReceipt = (sale: Sale, customer: Customer | undefined) => {
    const doc = new jsPDF();

    // Company Details
    const companyName = "PT. UNCLE EGGHEAD INDONESIA";
    const companyEmail = "uncleeggheads@gmail.com";
    const companyPhone = "+6285183129884";
    const companyAddress = "Jl. Raya Nyuh Tebal, Pesedahan, Karangasem, Bali 80871";

    const formatDate = (dateString: string) => new Date(dateString + 'T00:00:00').toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    const formatCurrency = (amount: number) => new Intl.NumberFormat('id-ID').format(amount);
    
    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text("INVOICE", 14, 22);

    doc.setFontSize(12);
    doc.text(companyName, 196, 22, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(companyAddress, 196, 27, { align: 'right' });
    doc.text(companyEmail, 196, 32, { align: 'right' });
    doc.text(companyPhone, 196, 37, { align: 'right' });
    
    doc.setLineWidth(0.1);
    doc.line(14, 42, 196, 42);


    // Customer and Invoice Details
    doc.setFontSize(9);
    doc.text("KEPADA PELANGGAN:", 14, 48);
    doc.setFont('helvetica', 'bold');
    doc.text(customer?.name || "N/A", 14, 53);
    doc.setFont('helvetica', 'normal');
    doc.text(customer?.address || "N/A", 14, 58);
    doc.text(`Telp: ${customer?.phone || 'N/A'}`, 14, 63);

    doc.text("No. Invoice", 130, 48);
    doc.text("Dicatat oleh", 130, 53);
    doc.text("Tanggal", 130, 58);
    doc.text("Bayar via", 130, 63);

    const invoiceId = `INV-${new Date(sale.saleDate).getFullYear()}-${sale.id.toUpperCase()}`;
    doc.setFont('helvetica', 'bold');
    doc.text(`: ${invoiceId}`, 150, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(`: ${sale.recordedBy}`, 150, 53);
    doc.text(`: ${formatDate(sale.saleDate)}`, 150, 58);
    doc.text(`: ${sale.paymentMethod}`, 150, 63);


    // Table
    const tableData = sale.items.map(item => {
        const pricePerUnit = item.quantity > 0 ? item.price / item.quantity : 0;
        return [
            item.productName,
            `${item.quantity} ${item.unit}`,
            formatCurrency(pricePerUnit),
            formatCurrency(item.price)
        ]
    });

    doc.autoTable({
        startY: 70,
        head: [['DESKRIPSI', 'QTY', 'HARGA SATUAN (RP)', 'JUMLAH (RP)']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [34, 40, 49], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 5;

    // Totals Section
    const addTotalLine = (label: string, value: string, isBold = false) => {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.text(label, 130, finalY);
        doc.text(value, 196, finalY, { align: 'right' });
        finalY += 6;
    }

    addTotalLine('Subtotal', `Rp ${formatCurrency(sale.totalPrice)}`);
    addTotalLine('Pajak (0%)', `Rp 0`);
    finalY += 2; 
    doc.line(130, finalY - 4, 196, finalY - 4);

    doc.setFontSize(12);
    addTotalLine('TOTAL TAGIHAN', `Rp ${formatCurrency(sale.totalPrice)}`, true);
    finalY += 2;

    addTotalLine('Pembayaran Diterima', `Rp ${formatCurrency(sale.amountPaid)}`);

    doc.setFontSize(12);
    addTotalLine('SISA TAGIHAN', `Rp ${formatCurrency(sale.balance)}`, true);
    finalY += 5;


    // Footer Notes
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Catatan & Syarat Pembayaran', 14, finalY);
    doc.setFont('helvetica', 'normal');
    finalY += 4;
    doc.text('Pembayaran harus dilakukan dalam 1x24 jam sejak tanggal faktur.', 14, finalY);
    finalY += 6;

    doc.setFont('helvetica', 'bold');
    doc.text('Detail Pembayaran Transfer Bank:', 14, finalY);
    doc.setFont('helvetica', 'normal');
    finalY += 4;
    doc.text('Bank: Bank BRI', 14, finalY);
    finalY += 4;
    doc.text('Nomor Rekening: 057901066725502', 14, finalY);
    finalY += 4;
    doc.text('Atas Nama: I Gede Eka Samdyana Putra', 14, finalY);
    finalY += 6;

    doc.setFont('helvetica', 'italic');
    doc.text('Terima kasih atas bisnis Anda!', 196, finalY + 5, { align: 'right' });

    // Open PDF in new tab
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
};
