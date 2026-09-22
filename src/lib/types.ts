import { Timestamp } from 'firebase/firestore';

// Data Structures
export interface StockEntry {
  id: string;
  quantity: number;
  stockInDate: string;
  productName: string;
  createdAt: Timestamp;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  createdAt: Timestamp;
}

export interface SaleItem {
  productName: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  price: number;
}

export interface Sale {
  id: string;
  items: SaleItem[];
  totalPrice: number;
  saleDate: string;
  customerId: string;
  paymentStatus: 'Lunas' | 'Belum Lunas';
  amountPaid: number;
  balance: number;
  paymentMethod: 'Cash' | 'Transfer Bank' | 'QRIS';
  recordedBy: string;
  createdAt: Timestamp;
}

export interface ExpenseItem {
  description: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface Expense {
  id: string;
  items: ExpenseItem[];
  totalAmount: number;
  expenseDate: string;
createdAt: Timestamp;
}


export interface ActivityLog {
  id: string;
  date: Timestamp;
  activity: string;
  details: string;
  user: string;
}

export interface PayrollHistory {
  id: string;
  payPeriod: string; // e.g., "2024-07"
  grossSalary: number;
  allowances: number;
  deductions: {
    pph21: number;
    bpjs: number;
  };
  netSalary: number;
  payslipUrl?: string; // URL to the generated PDF in Cloud Storage
  processedAt: Timestamp;
}

export interface Employee {
  id: string;
  name: string;
  npwp: string;
  ptkpStatus: string;
  bankAccount: string;
  payrollHistory?: PayrollHistory[];
  createdAt: Timestamp;
}
