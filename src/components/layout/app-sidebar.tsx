'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UncleEggheadLogo } from '@/components/icons';
import { LayoutDashboard, DollarSign, Archive, History, Users, Download, Sheet, Briefcase } from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { useToast } from '@/hooks/use-toast';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { exportToCSV, exportToXLSX, exportToPDF } from '@/lib/export-utils';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query } from 'firebase/firestore';
import type { StockEntry, Sale, Expense, Customer } from '@/lib/types';


function ExportMenu() {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    // Queries
    const stockQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/stock`)) : null, [user, firestore]);
    const salesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/sales`)) : null, [user, firestore]);
    const expensesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/expenses`)) : null, [user, firestore]);
    const customersQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/customers`)) : null, [user, firestore]);

    // Data
    const { data: stockEntries } = useCollection<StockEntry>(stockQuery);
    const { data: sales } = useCollection<Sale>(salesQuery);
    const { data: expenses } = useCollection<Expense>(expensesQuery);
    const { data: customers } = useCollection<Customer>(customersQuery);

    const exportHeaders = {
        STOCK: ['ID', 'Nama Produk', 'Kuantitas Dasar', 'Tanggal Masuk'],
        CUSTOMERS: ['ID', 'Nama', 'Telepon', 'Alamat'],
        SALES: ['ID', 'Pelanggan', 'Item', 'Total Harga', 'Dibayar', 'Sisa', 'Status', 'Tanggal Jual'],
        EXPENSES: ['ID', 'Deskripsi', 'Jumlah', 'Tanggal Pengeluaran'],
    };

    const handleExport = (format: 'csv' | 'xlsx' | 'pdf', dataName: keyof typeof exportHeaders, data: any[]) => {
        if (!data || data.length === 0) {
            toast({ variant: 'destructive', title: 'Ekspor Gagal', description: `Tidak ada data ${dataName} untuk diekspor.` });
            return;
        }
        const headers = exportHeaders[dataName];
        toast({ title: 'Mengekspor Data...', description: `Data ${dataName} sedang diekspor ke format ${format}.` });
        try {
            if (format === 'csv') {
                exportToCSV(data.map(item => Object.values(item)), headers, `${dataName}.csv`);
            } else if (format === 'xlsx') {
                exportToXLSX(data, headers, `${dataName}.xlsx`);
            } else if (format === 'pdf') {
                exportToPDF(data, headers, `Laporan ${dataName}.pdf`, `Laporan ${dataName}`);
            }
            toast({ title: 'Ekspor Berhasil!', description: `Data ${dataName} berhasil diekspor.` });
        } catch (error) {
            console.error('Export error:', error);
            toast({ variant: 'destructive', title: 'Ekspor Gagal', description: `Terjadi kesalahan saat mengekspor data ${dataName}.` });
        }
    };
    
    const inventoryData = (stockEntries || []).map(item => ({
        'ID': item.id,
        'Nama Produk': item.productName,
        'Kuantitas Dasar': item.quantity,
        'Tanggal Masuk': item.stockInDate,
    }));

    const customerData = (customers || []).map(item => ({
        'ID': item.id,
        'Nama': item.name,
        'Telepon': item.phone,
        'Alamat': item.address,
    }));
    
    const salesData = (sales || []).map(sale => {
        const customer = (customers || []).find(c => c.id === sale.customerId);
        const itemsSummary = sale.items.map(i => `${i.productName} (${i.quantity} ${i.unit})`).join(', ');
        return {
            'ID': sale.id,
            'Pelanggan': customer ? customer.name : 'N/A',
            'Item': itemsSummary,
            'Total Harga': sale.totalPrice,
            'Dibayar': sale.amountPaid,
            'Sisa': sale.balance,
            'Status': sale.paymentStatus,
            'Tanggal Jual': sale.saleDate,
        }
    });

    const expensesData = (expenses || []).map(item => ({
        'ID': item.id,
        'Deskripsi': item.items.map(i => i.description).join(', '),
        'Jumlah': item.totalAmount,
        'Tanggal Pengeluaran': item.expenseDate,
    }));
    
    const exportOptions = [
        { name: 'STOCK' as const, data: inventoryData, label: 'Inventaris' },
        { name: 'CUSTOMERS' as const, data: customerData, label: 'Pelanggan' },
        { name: 'SALES' as const, data: salesData, label: 'Penjualan' },
        { name: 'EXPENSES' as const, data: expensesData, label: 'Pengeluaran' },
    ];
    
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                 <SidebarMenuButton
                    tooltip={{ children: 'Ekspor Data', side: 'right' }}
                >
                    <Download />
                </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 glass-dialog" side="right" align="start">
                {exportOptions.map(option => (
                     <DropdownMenuSub key={option.name}>
                        <DropdownMenuSubTrigger>{option.label}</DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent className="glass-dialog" sideOffset={8}>
                                <DropdownMenuItem disabled={!option.data || option.data.length === 0} onClick={() => handleExport('csv', option.name, option.data)}>ke CSV</DropdownMenuItem>
                                <DropdownMenuItem disabled={!option.data || option.data.length === 0} onClick={() => handleExport('xlsx', option.name, option.data)}>ke XLSX</DropdownMenuItem>
                                <DropdownMenuItem disabled={!option.data || option.data.length === 0} onClick={() => handleExport('pdf', option.name, option.data)}>ke PDF</DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const sidebarNavItems = [
    { href: '/', label: 'Dasbor', icon: <LayoutDashboard /> },
    { href: '/inventory', label: 'Inventaris', icon: <Archive /> },
    { href: '/customers', label: 'Pelanggan', icon: <Users /> },
    { href: '/financials', label: 'Keuangan', icon: <DollarSign /> },
    { href: '/payroll', label: 'Payroll', icon: <Briefcase /> },
    { href: '/logs', label: 'Log Aktivitas', icon: <History /> },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <UncleEggheadLogo className="h-8 w-auto" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {sidebarNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))}
                tooltip={{ children: item.label, side: 'right' }}
              >
                <Link href={item.href}>{item.icon}</Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
              <ExportMenu />
          </SidebarMenuItem>
          {user?.email === 'mzazu6@gmail.com' && (
            <SidebarMenuItem>
                <SidebarMenuButton
                    asChild
                    tooltip={{ children: 'Buka Spreadsheet', side: 'right' }}
                >
                    <Link href={`https://docs.google.com/spreadsheets/d/${process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID || ''}`} target="_blank">
                        <Sheet />
                    </Link>
                </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}
