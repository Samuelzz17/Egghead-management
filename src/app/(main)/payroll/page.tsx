'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Edit, Trash2, MoreHorizontal, Search, Loader2, FileText, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, Timestamp, query, orderBy, arrayUnion } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Employee, ActivityLog, PayrollHistory } from '@/lib/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// --- Helper Functions ---
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
};
const handleCurrencyInput = (e: React.ChangeEvent<HTMLInputElement>, field: any) => {
    const value = e.target.value.replace(/\D/g, '');
    field.onChange(Number(value));
};

const generatePayslipPDF = (payrollData: PayrollHistory, employeeData: Employee) => {
    const doc = new jsPDF();
    const companyName = "PT. UNCLE EGGHEAD INDONESIA";
    const payPeriod = new Date(payrollData.payPeriod + '-02').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text("SLIP GAJI", 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(companyName, 105, 27, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Periode: ${payPeriod}`, 105, 32, { align: 'center' });
    doc.line(14, 38, 196, 38);

    // Employee Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Nama Karyawan", 14, 45);
    doc.text("Status", 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`: ${employeeData.name}`, 50, 45);
    doc.text(`: ${employeeData.ptkpStatus}`, 50, 50);

    // Earnings and Deductions
    const earningsData = [
        ["Gaji Pokok", formatCurrency(payrollData.grossSalary)],
        ["Tunjangan", formatCurrency(payrollData.allowances)],
    ];
    const deductionsData = [
        ["Pajak PPh 21", formatCurrency(payrollData.deductions?.pph21 || 0)],
        ["Iuran BPJS (Kesehatan & TK)", formatCurrency(payrollData.deductions?.bpjs || 0)],
    ];

    autoTable(doc, {
        startY: 55,
        head: [['PENDAPATAN', '']],
        body: earningsData,
        theme: 'plain',
        headStyles: { fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' } }
    });

    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 5,
        head: [['POTONGAN', '']],
        body: deductionsData,
        theme: 'plain',
        headStyles: { fontStyle: 'bold' },
        columnStyles: { 1: { halign: 'right' } }
    });
    
    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const totalEarnings = payrollData.grossSalary + payrollData.allowances;
    const totalDeductions = (payrollData.deductions?.pph21 || 0) + (payrollData.deductions?.bpjs || 0);
    
    doc.text("Total Pendapatan", 14, finalY);
    doc.text(formatCurrency(totalEarnings), 120, finalY, { align: 'right' });
    doc.text("Total Potongan", 14, finalY + 7);
    doc.text(formatCurrency(totalDeductions), 120, finalY + 7, { align: 'right' });
    
    doc.line(14, finalY + 10, 196, finalY + 10);
    
    doc.setFontSize(14);
    doc.text("GAJI BERSIH (THP)", 14, finalY + 17);
    doc.text(formatCurrency(payrollData.netSalary), 196, finalY + 17, { align: 'right' });

    // Footer
    const date = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFontSize(10);
    doc.text(`Karangasem, ${date}`, 196, finalY + 40, { align: 'right' });
    doc.text("(.........................)", 196, finalY + 65, { align: 'right' });
    doc.text("Penerima", 196, finalY + 70, { align: 'right' });
    
    return doc;
};

// --- PTKP Status Options ---
const ptkpStatusOptions = [
    { value: "TK0", label: "TK/0 (Tidak Kawin, 0 Tanggungan)" },
    { value: "TK1", label: "TK/1 (Tidak Kawin, 1 Tanggungan)" },
    { value: "TK2", label: "TK/2 (Tidak Kawin, 2 Tanggungan)" },
    { value: "TK3", label: "TK/3 (Tidak Kawin, 3 Tanggungan)" },
    { value: "K0", label: "K/0 (Kawin, 0 Tanggungan)" },
    { value: "K1", label: "K/1 (Kawin, 1 Tanggungan)" },
    { value: "K2", label: "K/2 (Kawin, 2 Tanggungan)" },
    { value: "K3", label: "K/3 (Kawin, 3 Tanggungan)" },
];

// --- Zod Schemas ---
const employeeSchema = z.object({
  name: z.string().min(1, 'Nama wajib diisi.'),
  npwp: z.string().optional(),
  ptkpStatus: z.string().min(1, 'Status PTKP wajib dipilih.'),
  bankAccount: z.string().min(1, 'Nomor rekening wajib diisi.'),
});

const payrollSchema = z.object({
    payPeriod: z.string().min(1, 'Periode Gaji wajib diisi'),
    grossSalary: z.number().min(0, 'Gaji Pokok tidak boleh negatif'),
    allowances: z.number().min(0, 'Tunjangan tidak boleh negatif'),
});

// --- Employee Form Component ---
function EmployeeForm({ open, onOpenChange, employeeToEdit, onActionSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; employeeToEdit?: Employee | null; onActionSuccess: () => void; }) {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof employeeSchema>>({
        resolver: zodResolver(employeeSchema),
    });

    useEffect(() => {
        if (employeeToEdit) {
            form.reset({
                name: employeeToEdit.name,
                npwp: employeeToEdit.npwp,
                ptkpStatus: employeeToEdit.ptkpStatus,
                bankAccount: employeeToEdit.bankAccount,
            });
        } else {
            form.reset({ name: '', npwp: '', ptkpStatus: '', bankAccount: '' });
        }
    }, [employeeToEdit, form]);

    const addLog = useCallback(async (activity: string, details: string) => {
        if (!user || !firestore) return;
        const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
        const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
        await setDoc(logRef, newLog);
    }, [user, firestore]);

    async function onSubmit(values: z.infer<typeof employeeSchema>) {
        if (!user || !firestore) return;
        setIsLoading(true);

        try {
            if (employeeToEdit) {
                const employeeRef = doc(firestore, `users/${user.uid}/employees`, employeeToEdit.id);
                await setDoc(employeeRef, values, { merge: true });
                toast({ title: 'Sukses!', description: 'Data karyawan berhasil diperbarui.' });
                await addLog('Update Karyawan', `Memperbarui data karyawan: ${values.name}`);
            } else {
                const employeeRef = doc(collection(firestore, `users/${user.uid}/employees`));
                const newEmployee = { ...values, id: employeeRef.id, createdAt: Timestamp.now(), payrollHistory: [] };
                await setDoc(employeeRef, newEmployee);
                toast({ title: 'Sukses!', description: 'Karyawan baru berhasil ditambahkan.' });
                await addLog('Tambah Karyawan', `Menambahkan karyawan baru: ${values.name}`);
            }
            onActionSuccess();
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save employee:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Gagal menyimpan data karyawan.' });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='glass-dialog'>
                <DialogHeader>
                    <DialogTitle>{employeeToEdit ? 'Edit Karyawan' : 'Tambah Karyawan Baru'}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Nama Lengkap</FormLabel><FormControl><Input placeholder="Nama karyawan" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="npwp" render={({ field }) => (<FormItem><FormLabel>Nomor NPWP (Opsional)</FormLabel><FormControl><Input placeholder="Nomor NPWP" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="ptkpStatus" render={({ field }) => (<FormItem><FormLabel>Status PTKP</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih status..." /></SelectTrigger></FormControl><SelectContent>{ptkpStatusOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="bankAccount" render={({ field }) => (<FormItem><FormLabel>Nomor Rekening</FormLabel><FormControl><Input placeholder="cth: BCA 1234567890" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <DialogFooter>
                            <DialogClose asChild><Button variant="outline" disabled={isLoading}>Batal</Button></DialogClose>
                            <Button type="submit" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {employeeToEdit ? 'Simpan Perubahan' : 'Tambah Karyawan'}</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}


// --- Payroll Form Component ---
function PayrollForm({ open, onOpenChange, employee, onActionSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; employee: Employee; onActionSuccess: () => void; }) {
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof payrollSchema>>({
        resolver: zodResolver(payrollSchema),
        defaultValues: {
            payPeriod: new Date().toISOString().slice(0, 7), // YYYY-MM format
            grossSalary: 0,
            allowances: 0,
        },
    });
    
    const addLog = useCallback(async (activity: string, details: string) => {
        if (!user || !firestore) return;
        const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
        const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
        await setDoc(logRef, newLog);
    }, [user, firestore]);

    async function onSubmit(values: z.infer<typeof payrollSchema>) {
        if (!user || !firestore) return;
        setIsLoading(true);

        try {
            // Placeholder calculations
            const pph21 = values.grossSalary * 0.05; // Simple 5% tax, NOT accurate
            const bpjs = 150000; // Fixed placeholder
            
            const totalDeductions = pph21 + bpjs;
            const netSalary = (values.grossSalary + values.allowances) - totalDeductions;
            
            const payrollHistoryId = doc(collection(firestore, 'id_generator')).id;

            const newPayrollRecord: PayrollHistory = {
                id: payrollHistoryId,
                payPeriod: values.payPeriod,
                grossSalary: values.grossSalary,
                allowances: values.allowances,
                deductions: { pph21, bpjs },
                netSalary: netSalary,
                processedAt: Timestamp.now(),
            };
            
            // Generate PDF and download it
            const pdfDoc = generatePayslipPDF(newPayrollRecord, employee);
            pdfDoc.save(`Slip_Gaji_${employee.name.replace(' ', '_')}_${values.payPeriod}.pdf`);

            // TODO: In the future, upload PDF to Firebase Storage and get URL
            // For now, we will skip the upload and saving URL part.

            const employeeRef = doc(firestore, `users/${user.uid}/employees`, employee.id);
            await setDoc(employeeRef, {
                payrollHistory: arrayUnion(newPayrollRecord)
            }, { merge: true });

            toast({ title: 'Sukses!', description: `Gaji untuk ${employee.name} berhasil diproses dan slip gaji telah diunduh.` });
            await addLog('Proses Gaji', `Memproses gaji untuk ${employee.name} periode ${values.payPeriod}`);
            onActionSuccess();
            onOpenChange(false);

        } catch (error) {
            console.error("Failed to process payroll:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Gagal memproses gaji.' });
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='glass-dialog'>
                <DialogHeader>
                    <DialogTitle>Proses Gaji untuk {employee.name}</DialogTitle>
                    <DialogDescription>Masukkan detail gaji untuk periode ini.</DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                        <FormField control={form.control} name="payPeriod" render={({ field }) => (<FormItem><FormLabel>Periode Gaji (Bulan & Tahun)</FormLabel><FormControl><Input type="month" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="grossSalary" render={({ field }) => (<FormItem><FormLabel>Gaji Pokok (Bruto)</FormLabel><FormControl><Input type="text" placeholder="e.g., 5000000" value={formatCurrency(field.value).replace('Rp', '').trim()} onChange={(e) => handleCurrencyInput(e, field)} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={form.control} name="allowances" render={({ field }) => (<FormItem><FormLabel>Tunjangan</FormLabel><FormControl><Input type="text" placeholder="e.g., 500000" value={formatCurrency(field.value).replace('Rp', '').trim()} onChange={(e) => handleCurrencyInput(e, field)} /></FormControl><FormMessage /></FormItem>)} />
                        <Card className='mt-4 bg-secondary/50'>
                            <CardContent className='pt-6'>
                                <p className='text-sm text-muted-foreground'>Potongan (Estimasi):</p>
                                <ul className='list-disc pl-5 text-sm'>
                                    <li>PPh 21: <span className='font-mono'>{formatCurrency(form.watch('grossSalary') * 0.05)}</span> (Placeholder 5%)</li>
                                    <li>BPJS: <span className='font-mono'>{formatCurrency(150000)}</span> (Placeholder)</li>
                                </ul>
                                <p className='mt-2 font-bold text-md'>Estimasi Gaji Bersih (THP): <span className='font-mono'>{formatCurrency((form.watch('grossSalary') + form.watch('allowances')) - (form.watch('grossSalary') * 0.05 + 150000))}</span></p>
                            </CardContent>
                        </Card>
                        <DialogFooter>
                            <DialogClose asChild><Button variant="outline" disabled={isLoading}>Batal</Button></DialogClose>
                            <Button type="submit" disabled={isLoading}>{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Proses & Unduh Slip</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}

// --- Employee Row Component ---
function EmployeeRow({ employee, onActionSuccess }: { employee: Employee; onActionSuccess: () => void; }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isPayrollFormOpen, setIsPayrollFormOpen] = useState(false);
    const { user } = useUser();
    const firestore = useFirestore();
    const { toast } = useToast();

    const addLog = useCallback(async (activity: string, details: string) => {
        if (!user || !firestore) return;
        const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
        const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
        await setDoc(logRef, newLog);
    }, [user, firestore]);

    const deleteEmployee = async (id: string) => {
        if (!user || !firestore) return;
        const employeeRef = doc(firestore, `users/${user.uid}/employees`, id);
        try {
            await deleteDoc(employeeRef);
            toast({ title: 'Sukses!', description: 'Data karyawan berhasil dihapus.' });
            await addLog('Hapus Karyawan', `Menghapus karyawan: ${employee.name}`);
            onActionSuccess();
        } catch (error) {
            console.error("Failed to delete employee:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Gagal menghapus data karyawan.' });
        }
    };
    
    const handleDownloadPayslip = (payrollHistory: PayrollHistory) => {
        try {
            const pdfDoc = generatePayslipPDF(payrollHistory, employee);
            pdfDoc.save(`Slip_Gaji_${employee.name.replace(' ', '_')}_${payrollHistory.payPeriod}.pdf`);
            toast({ title: 'Sukses!', description: 'Slip gaji berhasil diunduh.' });
        } catch (error) {
            console.error("Failed to generate or download payslip:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Gagal mengunduh slip gaji.' });
        }
    };

    return (
        <>
            {isFormOpen && <EmployeeForm open={isFormOpen} onOpenChange={setIsFormOpen} employeeToEdit={employee} onActionSuccess={onActionSuccess} />}
            {isPayrollFormOpen && <PayrollForm open={isPayrollFormOpen} onOpenChange={setIsPayrollFormOpen} employee={employee} onActionSuccess={onActionSuccess} />}

            <Collapsible asChild>
                <>
                    <TableRow className="cursor-pointer hover:bg-muted/50" data-state={isOpen ? 'open' : 'closed'} onClick={() => setIsOpen(!isOpen)}>
                        <TableCell>
                             <CollapsibleTrigger asChild>
                                <span className="font-medium flex items-center gap-2">
                                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    {employee.name}
                                </span>
                             </CollapsibleTrigger>
                        </TableCell>
                        <TableCell>{employee.npwp || '-'}</TableCell>
                        <TableCell>{employee.ptkpStatus}</TableCell>
                        <TableCell>{employee.bankAccount}</TableCell>
                        <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}><span className="sr-only">Buka menu</span><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className='glass-dialog' onClick={(e) => e.stopPropagation()}>
                                    <DropdownMenuItem onClick={() => setIsPayrollFormOpen(true)}><FileText className="mr-2 h-4 w-4" /><span>Proses Gaji</span></DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setIsFormOpen(true)}><Edit className="mr-2 h-4 w-4" /><span>Edit</span></DropdownMenuItem>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:bg-red-500/20 focus:text-red-500"><Trash2 className="mr-2 h-4 w-4" /><span>Hapus</span></DropdownMenuItem></AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>Anda yakin?</AlertDialogTitle><AlertDialogDescription>Tindakan ini akan menghapus data karyawan secara permanen.</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={() => deleteEmployee(employee.id)}>Hapus</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </TableCell>
                    </TableRow>
                     <CollapsibleContent asChild>
                        <TableRow>
                            <TableCell colSpan={5} className="p-0">
                                <div className="p-4 bg-secondary/30">
                                    <h4 className="font-semibold mb-2">Riwayat Penggajian</h4>
                                    {(employee.payrollHistory && employee.payrollHistory.length > 0) ? (
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Periode</TableHead><TableHead>Gaji Pokok</TableHead><TableHead>Tunjangan</TableHead><TableHead>Potongan</TableHead><TableHead>Gaji Bersih</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {employee.payrollHistory.sort((a,b) => b.payPeriod.localeCompare(a.payPeriod)).map(history => (
                                                <TableRow key={history.id}>
                                                    <TableCell>{new Date(history.payPeriod + '-02').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</TableCell>
                                                    <TableCell>{formatCurrency(history.grossSalary)}</TableCell>
                                                    <TableCell>{formatCurrency(history.allowances)}</TableCell>
                                                    <TableCell>{formatCurrency((history.deductions?.pph21 || 0) + (history.deductions?.bpjs || 0))}</TableCell>
                                                    <TableCell>{formatCurrency(history.netSalary)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDownloadPayslip(history); }}>
                                                            <Download className="h-4 w-4" />
                                                            <span className="sr-only">Unduh Slip Gaji</span>
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Belum ada riwayat penggajian.</p>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    </CollapsibleContent>
                </>
            </Collapsible>
        </>
    );
}

// --- Main Page Component ---
export default function PayrollPage() {
    const { user } = useUser();
    const firestore = useFirestore();
    
    const employeesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/employees`), orderBy('createdAt', 'desc')) : null, [user, firestore]);
    const { data: employees, isLoading } = useCollection<Employee>(employeesQuery);

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const [forceRefetch, setForceRefetch] = useState(0);

    const onActionSuccess = () => setForceRefetch(f => f + 1);

    const filteredEmployees = (employees || []).filter(emp =>
        emp.name.toLowerCase().includes(filter.toLowerCase())
    );

    if (isLoading) {
        return <div className="flex items-center justify-center h-[calc(100vh-12rem)]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="space-y-8 pb-16 md:pb-0">
            <div>
                <h2 className="text-3xl font-black tracking-tight font-headline">Manajemen Payroll</h2>
                <p className="text-muted-foreground">Kelola data karyawan dan proses penggajian bulanan.</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Daftar Karyawan</CardTitle>
                            <CardDescription>Semua karyawan yang terdaftar dalam sistem.</CardDescription>
                        </div>
                        <div className="flex w-full sm:w-auto items-center gap-2">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="search" placeholder="Cari karyawan..." className="pl-8" value={filter} onChange={(e) => setFilter(e.target.value)} />
                            </div>
                            <Button className='hidden md:inline-flex' onClick={() => setIsAddDialogOpen(true)}><PlusCircle className="mr-2 h-4 w-4" /> Tambah</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>NPWP</TableHead><TableHead>Status PTKP</TableHead><TableHead>Rekening</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                        <TableBody>
                            {filteredEmployees.length > 0 ? (
                                filteredEmployees.map((employee) => <EmployeeRow key={employee.id} employee={employee} onActionSuccess={onActionSuccess} />)
                            ) : (
                                <TableRow><TableCell colSpan={5} className="h-24 text-center">{employees && employees.length > 0 ? 'Karyawan tidak ditemukan.' : 'Belum ada data karyawan.'}</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <EmployeeForm open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onActionSuccess={onActionSuccess} />

            <Button size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 md:hidden" onClick={() => setIsAddDialogOpen(true)}>
                <PlusCircle className="h-6 w-6" /><span className="sr-only">Tambah Karyawan</span>
            </Button>
        </div>
    );
}
