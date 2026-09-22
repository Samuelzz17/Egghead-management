'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Edit, Trash2, Printer, CheckCircle, Search, X, User, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { CustomerForm } from '../customers/page';
import { generateReceipt } from '@/lib/export-utils';
import { Badge } from '@/components/ui/badge';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, setDoc, deleteDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Sale, Expense, Customer, SaleItem, ActivityLog, StockEntry, ExpenseItem } from '@/lib/types';
import { appendSheetRowAction, updateSheetRowAction, deleteSheetRowAction } from '@/lib/sheets-actions';
import { ScrollArea } from '@/components/ui/scroll-area';


const unitOptions = {
  'Butir': 1,
  'Pack': 10,
  'Tray': 30,
  'Kg': 1
};

const productTypes = [
  'Telur TK',
  'Telur TT',
  'Telur TB',
  'Telur Super',
  'Telur Omega Super',
  'Telur Omega TT',
  'Daging Ayam'
];

const paymentMethods = ['Cash', 'Transfer Bank', 'QRIS'] as const;

const saleItemSchema = z.object({
  productName: z.string().min(1, 'Produk harus dipilih.'),
  quantity: z.coerce.number().min(1, 'Kuantitas min. 1.'),
  unit: z.string().min(1, 'Unit harus dipilih.'),
  price: z.coerce.number().min(0, 'Harga harus positif.'), // Harga Satuan
  subtotal: z.coerce.number().min(0), // Subtotal (dihitung)
});


const saleSchema = z.object({
  customerId: z.string().min(1, 'Pelanggan harus dipilih.'),
  saleDate: z.string().min(1, 'Tanggal wajib diisi.'),
  items: z.array(saleItemSchema).min(1, 'Minimal harus ada satu item penjualan.'),
  amountPaid: z.string().refine(val => !isNaN(Number(val.replace(/\./g, ''))), { message: "Jumlah harus berupa angka."}).transform(val => Number(val.replace(/\./g, ''))).refine(val => val >= 0, { message: 'Jumlah tidak boleh negatif.' }),
  paymentMethod: z.enum(paymentMethods, { required_error: 'Metode pembayaran harus dipilih.'}),
  recordedBy: z.string().min(1, 'Nama pencatat wajib diisi.'),
});

type SaleFormValues = z.infer<typeof saleSchema>;

function SaleForm({ open, onOpenChange, saleToEdit, customers, availableStock, onActionSuccess, allSales }: { open: boolean, onOpenChange: (open: boolean) => void, saleToEdit?: Sale | null, customers: Customer[], availableStock: { [key: string]: number }, onActionSuccess: () => void, allSales: Sale[] }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isAddCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const defaultItem = { productName: '', quantity: 1, unit: 'Butir', price: 0, subtotal: 0};

  const form = useForm<SaleFormValues>({
    resolver: zodResolver(saleSchema),
    defaultValues: saleToEdit ? {
        customerId: saleToEdit.customerId,
        saleDate: saleToEdit.saleDate,
        amountPaid: new Intl.NumberFormat('id-ID').format(saleToEdit.amountPaid),
        paymentMethod: saleToEdit.paymentMethod,
        items: saleToEdit.items.map(item => {
            const pricePerUnit = (item.price / (item.quantity * unitOptions[item.unit as keyof typeof unitOptions])) * unitOptions[item.unit as keyof typeof unitOptions];
            return {
                productName: item.productName,
                quantity: item.quantity,
                unit: item.unit,
                price: pricePerUnit,
                subtotal: item.price,
            }
        }),
        recordedBy: saleToEdit.recordedBy,
    } : {
      customerId: '',
      saleDate: new Date().toISOString().split('T')[0],
      items: [defaultItem],
      amountPaid: '0',
      paymentMethod: 'Cash',
      recordedBy: user?.displayName || user?.email || '',
    },
  });
  
  useEffect(() => {
    if (user && !form.getValues('recordedBy') && !saleToEdit) {
      form.setValue('recordedBy', user.displayName || user.email || '');
    }
  }, [user, form, saleToEdit]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  
  const watchItems = form.watch('items');

  useEffect(() => {
    const subscription = form.watch((values, { name, type }) => {
        if (name && (name.startsWith('items') && (name.endsWith('.quantity') || name.endsWith('.price') || name.endsWith('.unit')))) {
            const items = values.items || [];
            items.forEach((item, index) => {
                const quantity = item?.quantity || 0;
                const price = item?.price || 0;
                const newSubtotal = quantity * price;
                form.setValue(`items.${index}.subtotal`, newSubtotal, { shouldValidate: true });
            });
        }
    });
    return () => subscription.unsubscribe();
  }, [form]);


  const totalPrice = watchItems.reduce((acc, current) => {
      return acc + (current.subtotal || 0);
  }, 0);

  const handleCurrencyInput = (e: React.ChangeEvent<HTMLInputElement>, field: any) => {
    const value = e.target.value.replace(/\D/g, '');
    const numberValue = Number(value);
    field.onChange(new Intl.NumberFormat('id-ID').format(numberValue)); // Pass formatted string to form
  };
  
  const addLog = useCallback(async (activity: string, details: string) => {
    if (!user || !firestore) return;
    const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
    const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
    await setDoc(logRef, newLog);
     try {
        await appendSheetRowAction('LOGS', [newLog.id, newLog.date.toDate().toISOString(), newLog.activity, newLog.details, newLog.user]);
    } catch (e) {
        console.error("Sheet Error (addLog):", e);
        toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Gagal mencatat log ke spreadsheet.' });
    }
  }, [user, firestore, toast]);
  
  async function onSubmit(values: SaleFormValues) {
    setIsLoading(true);
    if(!user || !firestore) {
      setIsLoading(false);
      return;
    };
    
    const customer = customers.find(c => c.id === values.customerId);
    if(!customer) {
        toast({variant: 'destructive', title: 'Error', description: 'Pelanggan tidak ditemukan'});
        setIsLoading(false);
        return;
    }

    const baseQuantity = (item: z.infer<typeof saleItemSchema>) => item.quantity * unitOptions[item.unit as keyof typeof unitOptions];
    
    const saleData = {
        ...values,
        items: values.items.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            baseQuantity: baseQuantity(item),
            price: item.subtotal, // Use the calculated subtotal as the final price for the item
        })),
        totalPrice: totalPrice,
        amountPaid: values.amountPaid,
    };
    
    const balance = saleData.totalPrice - saleData.amountPaid;
    const paymentStatus = balance <= 0 ? 'Lunas' : 'Belum Lunas';

    const itemsSummary = saleData.items.map(i => `${i.productName} (${i.quantity} ${i.unit})`).join('; ');

    try {
        if (saleToEdit) {
            const saleRef = doc(firestore, `users/${user.uid}/sales`, saleToEdit.id);
            const updatedSale = { ...saleData, id: saleToEdit.id, balance, paymentStatus, createdAt: saleToEdit.createdAt };
            await setDoc(saleRef, updatedSale, { merge: true });

            const rowIndex = allSales.findIndex(s => s.id === saleToEdit.id);
            if(rowIndex !== -1) {
                await updateSheetRowAction('SALES', rowIndex, [updatedSale.id, customer.name, itemsSummary, updatedSale.totalPrice, updatedSale.amountPaid, updatedSale.balance, updatedSale.paymentStatus, updatedSale.saleDate, updatedSale.recordedBy, updatedSale.createdAt.toDate().toISOString()]);
                toast({ title: 'Sukses!', description: 'Penjualan berhasil diperbarui dan disinkronkan.' });
            } else {
                 toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Gagal menemukan baris penjualan di spreadsheet untuk diperbarui.' });
            }
            
            await addLog('Edit Penjualan', `Mengubah data penjualan ID ${saleToEdit.id}. Dicatat oleh: ${values.recordedBy}. Status: ${paymentStatus}`);
        } else {
            const saleRef = doc(collection(firestore, `users/${user.uid}/sales`));
            const newSale = { ...saleData, id: saleRef.id, balance, paymentStatus, createdAt: Timestamp.now() };
            await setDoc(saleRef, newSale);

            await appendSheetRowAction('SALES', [newSale.id, customer.name, itemsSummary, newSale.totalPrice, newSale.amountPaid, newSale.balance, newSale.paymentStatus, newSale.saleDate, newSale.recordedBy, newSale.createdAt.toDate().toISOString()]);
            toast({ title: 'Sukses!', description: 'Penjualan berhasil dicatat dan disinkronkan.' });
            
            await addLog('Catat Penjualan', `Menambah penjualan kepada ${customer?.name || 'N/A'} sebesar ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(newSale.totalPrice)}. Dicatat oleh: ${newSale.recordedBy}. Status: ${paymentStatus}`);
        }
        form.reset();
        onOpenChange(false);
        onActionSuccess();

    } catch (error) {
        console.error("Failed to save sale or sync to sheet:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Gagal menyimpan atau sinkronisasi data penjualan.' });
    } finally {
        setIsLoading(false);
    }
  }

  return (
    <>
      <CustomerForm open={isAddCustomerDialogOpen} onOpenChange={setAddCustomerDialogOpen} onActionSuccess={onActionSuccess} allCustomers={customers} />
      <Dialog open={open} onOpenChange={(isOpen) => {
          onOpenChange(isOpen);
          if (!isOpen) form.reset();
      }}>
        <DialogContent className="custom-dialog-style max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{saleToEdit ? 'Edit Penjualan' : 'Catat Penjualan Baru'}</DialogTitle>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto pr-6 -mr-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <FormField control={form.control} name="customerId" render={({ field }) => ( <FormItem><FormLabel>Nama Pelanggan</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant="outline" role="combobox" className={cn("w-full justify-between",!field.value && "text-muted-foreground")}>{field.value? (customers || []).find((c) => c.id === field.value)?.name: "Pilih pelanggan"}<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-[--radix-popover-trigger-width] p-0 custom-dialog-style"><Command><CommandInput placeholder="Cari pelanggan..." /><CommandList><CommandEmpty><div className="p-4 text-sm">Pelanggan tidak ditemukan.<Button variant="link" className="p-0 h-auto ml-1" onClick={() => setAddCustomerDialogOpen(true)}>Tambah baru.</Button></div></CommandEmpty><CommandGroup>{(customers || []).map((customer) => (<CommandItem value={customer.name} key={customer.id} onSelect={() => {form.setValue("customerId", customer.id)}}>{customer.name}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent></Popover><FormMessage /></FormItem>)} />
                   <FormField control={form.control} name="saleDate" render={({ field }) => (<FormItem><FormLabel>Tanggal Penjualan</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
                 </div>
                
                <div className="space-y-4">
                  <FormLabel>Item Penjualan</FormLabel>
                  {fields.map((field, index) => (
                    <Card key={field.id} className="relative p-4 border-white bg-[rgb(203,203,203)] shadow-[0_10px_15px_-3px_rgb(0,0,0,0),0_4px_6px_-4px_rgb(0,0,0,0.1)]">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <FormField control={form.control} name={`items.${index}.productName`} render={({ field }) => (<FormItem><FormLabel>Produk</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger></FormControl><SelectContent className='custom-dialog-style'>{productTypes.map(q => (<SelectItem key={q} value={q}>{q}</SelectItem>))}</SelectContent></Select>
                         <FormDescription>
                            Sisa stok: {(availableStock[watchItems[index]?.productName] || 0).toLocaleString('id-ID')} {watchItems[index]?.productName.toLowerCase().includes('daging') ? 'kg' : 'butir'}
                          </FormDescription>
                         <FormMessage /></FormItem>)} />
                          <div className="grid grid-cols-3 gap-2">
                             <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Kuantitas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                             <FormField control={form.control} name={`items.${index}.unit`} render={({ field }) => (<FormItem><FormLabel>Unit</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger></FormControl><SelectContent className='custom-dialog-style'>{Object.keys(unitOptions).map(u => (<SelectItem key={u} value={u}>{u}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                          </div>
                          <FormField control={form.control} name={`items.${index}.price`} render={({ field }) => (<FormItem><FormLabel>Harga Satuan (Rp)</FormLabel><FormControl><Controller
                              control={form.control}
                              name={`items.${index}.price`}
                              render={({ field: { onChange, value, ...restField } }) => (
                                  <Input
                                      {...restField}
                                      value={new Intl.NumberFormat('id-ID').format(value || 0)}
                                      onChange={(e) => {
                                          const val = e.target.value.replace(/\D/g, '');
                                          onChange(Number(val));
                                      }}
                                  />
                              )}
                          /></FormControl><FormMessage /></FormItem>)} />
                         <FormField control={form.control} name={`items.${index}.subtotal`} render={({ field }) => (<FormItem><FormLabel>Subtotal (Rp)</FormLabel><FormControl><Input type="text" value={new Intl.NumberFormat('id-ID').format(field.value || 0)} readOnly className="bg-muted" /></FormControl><FormMessage /></FormItem>)} />
                      </div>
                       {fields.length > 1 && (
                        <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => remove(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </Card>
                  ))}
                   <Button type="button" variant="outline" size="sm" onClick={() => append(defaultItem)}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Item</Button>
                </div>

                <CardFooter className="flex-col items-stretch gap-4 p-0 pt-4">
                    <div className="flex justify-between items-center border-t pt-4">
                        <span className="text-lg font-semibold">Total Harga</span>
                        <span className="text-lg font-bold">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalPrice)}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={form.control} name="amountPaid" render={({ field }) => (<FormItem><FormLabel>Jumlah Dibayar (Rp)</FormLabel><FormControl><Input {...field} type="text" onChange={(e) => handleCurrencyInput(e, field)} value={new Intl.NumberFormat('id-ID').format(Number(field.value.toString().replace(/\./g, '')))} /></FormControl><FormMessage /></FormItem>)} />
                      <FormField control={form.control} name="paymentMethod" render={({ field }) => (<FormItem><FormLabel>Metode Pembayaran</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Pilih Metode" /></SelectTrigger></FormControl><SelectContent className="custom-dialog-style">{paymentMethods.map(method => (<SelectItem key={method} value={method}>{method}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                    </div>
                     <FormField control={form.control} name="recordedBy" render={({ field }) => (
                        <FormItem>
                            <FormLabel>Dicatat oleh</FormLabel>
                            <FormControl>
                                <Input placeholder="Nama pengguna" {...field} />
                            </FormControl>
                             <FormDescription>
                              Ini bisa diinput sendiri
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )} />
                </CardFooter>
                
                <DialogFooter className="pt-4 sticky bottom-0 bg-[rgb(203,203,203)] pb-2 -mb-2">
                  <DialogClose asChild><Button variant="custom" className="btn-custom-hover" disabled={isLoading}>Batal</Button></DialogClose>
                  <Button type="submit" variant="custom" className="btn-custom-hover" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {saleToEdit ? 'Simpan Perubahan' : 'Catat Penjualan'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const expenseItemSchema = z.object({
  description: z.string().min(1, 'Deskripsi wajib diisi.'),
  quantity: z.coerce.number().min(1, 'Kuantitas min. 1.'),
  price: z.coerce.number().min(0, 'Harga harus positif.'),
  subtotal: z.coerce.number().min(0),
});

const expenseSchema = z.object({
  expenseDate: z.string().min(1, 'Tanggal wajib diisi.'),
  items: z.array(expenseItemSchema).min(1, 'Minimal harus ada satu item pengeluaran.'),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

function ExpenseForm({ open, onOpenChange, expenseToEdit, onActionSuccess, allExpenses }: { open: boolean, onOpenChange: (open: boolean) => void, expenseToEdit?: Expense | null, onActionSuccess: () => void, allExpenses: Expense[] }) {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
  const defaultItem = { description: '', quantity: 1, price: 0, subtotal: 0 };

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: expenseToEdit ? {
        ...expenseToEdit,
        items: expenseToEdit.items.map(item => ({
          ...item,
          price: item.price,
          subtotal: item.subtotal,
        }))
    } : {
      expenseDate: new Date().toISOString().split('T')[0],
      items: [defaultItem],
    },
  });
  
  useEffect(() => {
    const subscription = form.watch((values, { name, type }) => {
        if (name && name.startsWith('items') && (name.endsWith('.quantity') || name.endsWith('.price'))) {
            const items = values.items || [];
            items.forEach((item, index) => {
                const quantity = item?.quantity || 0;
                const price = item?.price || 0;
                const newSubtotal = quantity * price;
                form.setValue(`items.${index}.subtotal`, newSubtotal, { shouldValidate: true });
            });
        }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = form.watch('items');

  const totalAmount = watchItems.reduce((acc, current) => {
    return acc + (current.subtotal || 0);
  }, 0);
  
  const addLog = useCallback(async (activity: string, details: string) => {
    if (!user || !firestore) return;
    const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
    const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
    await setDoc(logRef, newLog);
     try {
        await appendSheetRowAction('LOGS', [newLog.id, newLog.date.toDate().toISOString(), newLog.activity, newLog.details, newLog.user]);
    } catch (e) {
        console.error("Sheet Error (addLog):", e);
        toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Gagal mencatat log ke spreadsheet.' });
    }
  }, [user, firestore, toast]);
  
  async function onSubmit(values: ExpenseFormValues) {
    setIsLoading(true);
    if (!user || !firestore) {
      setIsLoading(false);
      return;
    }
    
    const expenseData = {
        ...values,
        items: values.items,
        totalAmount: totalAmount,
    };

    const itemsSummary = expenseData.items.map(i => `${i.description} (x${i.quantity})`).join('; ');

    try {
        if (expenseToEdit) {
            const expenseRef = doc(firestore, `users/${user.uid}/expenses`, expenseToEdit.id);
            const updatedExpense = { ...expenseData, id: expenseToEdit.id, createdAt: expenseToEdit.createdAt };
            await setDoc(expenseRef, updatedExpense, { merge: true });

            const rowIndex = allExpenses.findIndex(e => e.id === expenseToEdit.id);
            if(rowIndex !== -1){
                await updateSheetRowAction('EXPENSES', rowIndex, [updatedExpense.id, itemsSummary, updatedExpense.totalAmount, updatedExpense.expenseDate, updatedExpense.createdAt.toDate().toISOString()]);
                toast({ title: 'Sukses!', description: 'Pengeluaran berhasil diperbarui dan disinkronkan.' });
            } else {
                 toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Gagal menemukan baris pengeluaran di spreadsheet untuk diperbarui.' });
            }
            await addLog('Edit Pengeluaran', `Mengubah data pengeluaran ID ${expenseToEdit.id}.`);
        } else {
            const expenseRef = doc(collection(firestore, `users/${user.uid}/expenses`));
            const newExpense = { ...expenseData, id: expenseRef.id, createdAt: Timestamp.now() };
            await setDoc(expenseRef, newExpense);
            
            await appendSheetRowAction('EXPENSES', [newExpense.id, itemsSummary, newExpense.totalAmount, newExpense.expenseDate, newExpense.createdAt.toDate().toISOString()]);
            toast({ title: 'Sukses!', description: 'Pengeluaran berhasil dicatat dan disinkronkan.' });

            await addLog('Catat Pengeluaran', `Menambah pengeluaran: ${itemsSummary} sebesar ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(totalAmount)}.`);
        }

        form.reset();
        onOpenChange(false);
        onActionSuccess();
    } catch(error) {
        console.error("Failed to save or sync expense:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Gagal menyimpan atau sinkronisasi data pengeluaran.' });
    } finally {
        setIsLoading(false);
    }
  }
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) form.reset();
    }}>
      <DialogContent className='custom-dialog-style max-w-2xl max-h-[90vh] flex flex-col'>
        <DialogHeader><DialogTitle>{expenseToEdit ? 'Edit Pengeluaran' : 'Catat Pengeluaran Baru'}</DialogTitle></DialogHeader>
        <div className="flex-grow overflow-y-auto pr-6 -mr-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
             <FormField control={form.control} name="expenseDate" render={({ field }) => (<FormItem><FormLabel>Tanggal Pengeluaran</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
             
            <div className="space-y-4">
                <FormLabel>Item Pengeluaran</FormLabel>
                {fields.map((field, index) => (
                    <Card key={field.id} className="relative p-4 border-white bg-[rgb(203,203,203)] shadow-[0_10px_15px_-3px_rgb(0,0,0,0),0_4px_6px_-4px_rgb(0,0,0,0.1)]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormField control={form.control} name={`items.${index}.description`} render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Deskripsi</FormLabel><FormControl><Input placeholder="misalnya, Pakan Ayam 50kg" {...field} /></FormControl><FormMessage /></FormItem>)} />
                            <div className="grid grid-cols-3 gap-2">
                                <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem className="col-span-2"><FormLabel>Kuantitas</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>)} />
                                <FormItem><FormLabel>Unit</FormLabel><Input value="pcs" readOnly /></FormItem>
                            </div>
                            <FormField control={form.control} name={`items.${index}.price`} render={({ field }) => (<FormItem><FormLabel>Harga Satuan (Rp)</FormLabel><FormControl><Controller
                              control={form.control}
                              name={`items.${index}.price`}
                              render={({ field: { onChange, value, ...restField } }) => (
                                  <Input
                                      {...restField}
                                      value={new Intl.NumberFormat('id-ID').format(value || 0)}
                                      onChange={(e) => {
                                          const val = e.target.value.replace(/\D/g, '');
                                          onChange(Number(val));
                                      }}
                                  />
                              )}
                          /></FormControl><FormMessage /></FormItem>)} />
                             <FormField control={form.control} name={`items.${index}.subtotal`} render={({ field }) => (<FormItem className="md:col-span-2"><FormLabel>Subtotal (Rp)</FormLabel><FormControl><Input type="text" value={new Intl.NumberFormat('id-ID').format(field.value || 0)} readOnly className="bg-muted" /></FormControl><FormMessage /></FormItem>)} />
                        </div>
                        {fields.length > 1 && (
                        <Button variant="ghost" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => remove(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </Card>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => append(defaultItem)}><PlusCircle className="mr-2 h-4 w-4" /> Tambah Item</Button>
            </div>

            <CardFooter className="flex-col items-stretch gap-4 p-0 pt-4">
                <div className="flex justify-between items-center border-t pt-4">
                    <span className="text-lg font-semibold">Total Pengeluaran</span>
                    <span className="text-lg font-bold">
                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(totalAmount)}
                    </span>
                </div>
            </CardFooter>

            <DialogFooter className="pt-4">
              <DialogClose asChild><Button variant="custom" className="btn-custom-hover" disabled={isLoading}>Batal</Button></DialogClose>
              <Button type="submit" variant="custom" className="btn-custom-hover" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {expenseToEdit ? 'Simpan Perubahan' : 'Catat Pengeluaran'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function FinancialsPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [forceRefetch, setForceRefetch] = useState(0);

  // Queries
  const salesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/sales`), orderBy('createdAt', 'desc')) : null, [user, firestore, forceRefetch]);
  const expensesQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/expenses`), orderBy('createdAt', 'desc')) : null, [user, firestore, forceRefetch]);
  const customersQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/customers`)) : null, [user, firestore, forceRefetch]);
  const stockQuery = useMemoFirebase(() => user ? query(collection(firestore, `users/${user.uid}/stock`)) : null, [user, firestore, forceRefetch]);

  // Data
  const { data: sales, isLoading: isSalesLoading } = useCollection<Sale>(salesQuery);
  const { data: expenses, isLoading: isExpensesLoading } = useCollection<Expense>(expensesQuery);
  const { data: customers, isLoading: isCustomersLoading } = useCollection<Customer>(customersQuery);
  const { data: stockEntries, isLoading: isStockLoading } = useCollection<StockEntry>(stockQuery);
  
  const isDataLoading = isSalesLoading || isExpensesLoading || isCustomersLoading || isStockLoading;
  
  const [isAddSaleDialogOpen, setIsAddSaleDialogOpen] = useState(false);
  const [isAddExpenseDialogOpen, setIsAddExpenseDialogOpen] = useState(false);
  const [isEditSaleDialogOpen, setIsEditSaleDialogOpen] = useState(false);
  const [isEditExpenseDialogOpen, setIsEditExpenseDialogOpen] = useState(false);
  const [saleToEdit, setSaleToEdit] = useState<Sale | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState("sales");
  const [salesFilter, setSalesFilter] = useState('');
  const [expensesFilter, setExpensesFilter] = useState('');

  const onActionSuccess = () => setForceRefetch(f => f + 1);

  const addLog = useCallback(async (activity: string, details: string) => {
    if (!user || !firestore) return;
    const logRef = doc(collection(firestore, `users/${user.uid}/logs`));
    const newLog: ActivityLog = { id: logRef.id, date: Timestamp.now(), activity, details, user: user.displayName || user.email || 'Unknown' };
    await setDoc(logRef, newLog);
     try {
        await appendSheetRowAction('LOGS', [newLog.id, newLog.date.toDate().toISOString(), newLog.activity, newLog.details, newLog.user]);
    } catch (e) {
        console.error("Sheet Error (addLog):", e);
        toast({ variant: 'destructive', title: 'Sinkronisasi Gagal', description: 'Gagal mencatat log ke spreadsheet.' });
    }
  }, [user, firestore, toast]);

  const deleteSale = async (id: string) => {
    if(!user || !firestore || !sales || !customers) return;
    const saleToDelete = sales.find(s => s.id === id);
    if (!saleToDelete) return;
    const customer = customers.find(c => c.id === saleToDelete.customerId);
    
    const rowIndex = sales.findIndex(s => s.id === id);

    const saleRef = doc(firestore, `users/${user.uid}/sales`, id);
    await deleteDoc(saleRef);
    
    if(rowIndex !== -1) {
        await deleteSheetRowAction('SALES', rowIndex);
        toast({ title: 'Sukses!', description: 'Penjualan berhasil dihapus dan disinkronkan.' });
    } else {
        toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Gagal menemukan baris penjualan di spreadsheet untuk dihapus.' });
    }

    await addLog('Hapus Penjualan', `Menghapus data penjualan kepada ${customer?.name || 'N/A'}.`);
    onActionSuccess();
  };

  const deleteExpense = async (id: string) => {
    if(!user || !firestore || !expenses) return;
    const expenseToDelete = expenses.find(e => e.id === id);
    if (!expenseToDelete) return;
    const itemsSummary = expenseToDelete.items.map(i => i.description).join('; ');
    
    const rowIndex = expenses.findIndex(e => e.id === id);

    const expenseRef = doc(firestore, `users/${user.uid}/expenses`, id);
    await deleteDoc(expenseRef);
    
    if(rowIndex !== -1) {
        await deleteSheetRowAction('EXPENSES', rowIndex);
        toast({ title: 'Sukses!', description: 'Pengeluaran berhasil dihapus dan disinkronkan.' });
    } else {
        toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Gagal menemukan baris pengeluaran di spreadsheet untuk dihapus.' });
    }

    await addLog('Hapus Pengeluaran', `Menghapus pengeluaran: ${itemsSummary}.`);
    onActionSuccess();
  };
  
  const markAsPaid = async (id: string) => {
     if(!user || !firestore || !sales) return;
     const saleToUpdate = sales.find(s => s.id === id);
     if (!saleToUpdate) return;
     
     const saleRef = doc(firestore, `users/${user.uid}/sales`, id);
     await setDoc(saleRef, {
        amountPaid: saleToUpdate.totalPrice,
        balance: 0,
        paymentStatus: 'Lunas',
     }, { merge: true });

    const rowIndex = sales.findIndex(s => s.id === id);
     if(rowIndex !== -1) {
        const customer = customers?.find(c => c.id === saleToUpdate.customerId);
        const itemsSummary = saleToUpdate.items.map(i => `${i.productName} (${i.quantity} ${i.unit})`).join('; ');
        await updateSheetRowAction('SALES', rowIndex, [
            saleToUpdate.id,
            customer?.name || 'N/A',
            itemsSummary,
            saleToUpdate.totalPrice,
            saleToUpdate.totalPrice, // amountPaid is now total price
            0, // balance is 0
            'Lunas', // paymentStatus
            saleToUpdate.saleDate,
            saleToUpdate.recordedBy,
            saleToUpdate.createdAt.toDate().toISOString()
        ]);
        toast({ title: 'Sukses!', description: 'Status pembayaran berhasil diubah dan disinkronkan.' });
     } else {
        toast({ variant: 'destructive', title: 'Index Tidak Ditemukan', description: 'Gagal memperbarui status di spreadsheet.' });
     }


     await addLog('Update Pembayaran', `Penjualan ID ${id} ditandai lunas. Dicatat oleh: ${user.displayName || user.email || 'N/A'}`);
     onActionSuccess();
  };


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  }
  
  const handleEditSale = (sale: Sale) => {
    setSaleToEdit(sale);
    setIsEditSaleDialogOpen(true);
  }

  const handleEditExpense = (expense: Expense) => {
    setExpenseToEdit(expense);
    setIsEditExpenseDialogOpen(true);
  }

  const getCustomerName = (customerId: string) => {
    const customer = (customers || []).find(c => c.id === customerId);
    return customer ? customer.name : 'N/A';
  };

  const handlePrintReceipt = (sale: Sale) => {
    const customer = (customers || []).find(c => c.id === sale.customerId);
    generateReceipt(sale, customer);
  };

  const getSaleItemsSummary = (items: SaleItem[]) => {
    return items.map(item => `${item.productName} (${item.quantity} ${item.unit})`).join(', ');
  }
  
  const getExpenseItemsSummary = (items: ExpenseItem[]) => {
    if (!items || items.length === 0) return 'N/A';
    return items.map(item => `${item.description} (x${item.quantity})`).join(', ');
  };

  const filteredSales = (sales || []).filter(sale => {
    const customerName = getCustomerName(sale.customerId);
    const itemsSummary = getSaleItemsSummary(sale.items);
    return (
      customerName.toLowerCase().includes(salesFilter.toLowerCase()) ||
      itemsSummary.toLowerCase().includes(salesFilter.toLowerCase()) ||
      sale.paymentStatus.toLowerCase().includes(salesFilter.toLowerCase()) ||
      sale.paymentMethod.toLowerCase().includes(salesFilter.toLowerCase())
    )
  });

  const filteredExpenses = (expenses || []).filter(expense =>
    getExpenseItemsSummary(expense.items).toLowerCase().includes(expensesFilter.toLowerCase())
  );
  
  const availableStock = useMemo(() => {
    const stockByProduct: { [key: string]: number } = {};
    if (!stockEntries || !sales) return stockByProduct;

    productTypes.forEach(productName => {
      const totalIn = (stockEntries || []).filter(s => s.productName === productName).reduce((acc, s) => acc + s.quantity, 0);
      const totalOut = (sales || []).flatMap(s => s.items)
                            .filter(item => item.productName === productName)
                            .reduce((acc, item) => acc + item.baseQuantity, 0);
      stockByProduct[productName] = totalIn - totalOut;
    });
    
    return stockByProduct;
  }, [stockEntries, sales]);


  if (isDataLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16 md:pb-0">
      <div>
        <h2 className="text-3xl font-black tracking-tight font-headline">Keuangan</h2>
        <p className="text-muted-foreground">Lacak penjualan dan pengeluaran peternakan Anda.</p>
      </div>

      {isEditSaleDialogOpen && <SaleForm open={isEditSaleDialogOpen} onOpenChange={setIsEditSaleDialogOpen} saleToEdit={saleToEdit} customers={customers || []} availableStock={availableStock} onActionSuccess={onActionSuccess} allSales={sales || []} />}
      {isEditExpenseDialogOpen && <ExpenseForm open={isEditExpenseDialogOpen} onOpenChange={setIsEditExpenseDialogOpen} expenseToEdit={expenseToEdit} onActionSuccess={onActionSuccess} allExpenses={expenses || []} />}
      
      <Tabs defaultValue="sales" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sales">Penjualan</TabsTrigger>
          <TabsTrigger value="expenses">Pengeluaran</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <Card>
            <CardHeader><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"><div>
                  <CardTitle>Catatan Penjualan</CardTitle>
                  <CardDescription>Semua penjualan produk yang tercatat.</CardDescription></div>
                  <div className="flex w-full sm:w-auto items-center gap-2">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Cari penjualan..."
                        className="pl-8"
                        value={salesFilter}
                        onChange={(e) => setSalesFilter(e.target.value)}
                      />
                    </div>
                    <Dialog open={isAddSaleDialogOpen} onOpenChange={setIsAddSaleDialogOpen}>
                      <DialogTrigger asChild>
                          <Button className='hidden md:inline-flex'><PlusCircle className="mr-2 h-4 w-4" /> Catat</Button>
                      </DialogTrigger>
                      <SaleForm open={isAddSaleDialogOpen} onOpenChange={setIsAddSaleDialogOpen} customers={customers || []} availableStock={availableStock} onActionSuccess={onActionSuccess} allSales={sales || []} />
                    </Dialog>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Pelanggan</TableHead><TableHead>Item</TableHead><TableHead>Total Harga</TableHead><TableHead>Dibayar</TableHead><TableHead>Metode</TableHead><TableHead>Sisa</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredSales.length > 0 ? (filteredSales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>{new Date(sale.saleDate+'T00:00:00').toLocaleDateString('id-ID')}</TableCell>
                          <TableCell>{getCustomerName(sale.customerId)}</TableCell>
                          <TableCell>{getSaleItemsSummary(sale.items)}</TableCell>
                          <TableCell>{formatCurrency(sale.totalPrice)}</TableCell>
                          <TableCell>{formatCurrency(sale.amountPaid)}</TableCell>
                          <TableCell>{sale.paymentMethod}</TableCell>
                          <TableCell className={sale.balance > 0 ? "text-destructive" : ""}>{formatCurrency(sale.balance)}</TableCell>
                          <TableCell>
                            <Badge variant={sale.paymentStatus === 'Lunas' ? 'secondary' : 'destructive'} className={cn(sale.paymentStatus === 'Lunas' && "bg-green-100 text-green-800 border-green-200", sale.paymentStatus === 'Belum Lunas' && "bg-red-100 text-red-800 border-red-200")}>
                              {sale.paymentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Buka menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className='glass-dialog'>
                                {sale.paymentStatus === 'Belum Lunas' && (
                                  <DropdownMenuItem onClick={() => markAsPaid(sale.id)}>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    <span>Tandai Lunas</span>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handlePrintReceipt(sale)}>
                                  <Printer className="mr-2 h-4 w-4" />
                                  <span>Cetak Struk</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditSale(sale)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:bg-red-500/20 focus:text-red-500">
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      <span>Hapus</span>
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Anda yakin?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tindakan ini tidak dapat diurungkan. Ini akan menghapus data penjualan secara permanen.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Batal</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteSale(sale.id)}>Hapus</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))) : (<TableRow><TableCell colSpan={9} className="h-24 text-center">{(sales || []).length > 0 ? 'Tidak ada penjualan yang cocok.' : 'Belum ada penjualan yang dicatat.'}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="expenses">
          <Card>
            <CardHeader><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"><div>
                  <CardTitle>Catatan Pengeluaran</CardTitle>
                  <CardDescription>Semua pengeluaran peternakan yang tercatat.</CardDescription></div>
                  <div className="flex w-full sm:w-auto items-center gap-2">
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Cari pengeluaran..."
                        className="pl-8"
                        value={expensesFilter}
                        onChange={(e) => setExpensesFilter(e.target.value)}
                      />
                    </div>
                   <Dialog open={isAddExpenseDialogOpen} onOpenChange={setIsAddExpenseDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className='hidden md:inline-flex'><PlusCircle className="mr-2 h-4 w-4" /> Catat</Button>
                    </DialogTrigger>
                    <ExpenseForm open={isAddExpenseDialogOpen} onOpenChange={setIsAddExpenseDialogOpen} onActionSuccess={onActionSuccess} allExpenses={expenses || []} />
                  </Dialog>
                  </div>
                </div>
            </CardHeader>
            <CardContent>
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Deskripsi</TableHead><TableHead>Jumlah</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredExpenses.length > 0 ? (filteredExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell>{new Date(expense.expenseDate+'T00:00:00').toLocaleDateString('id-ID')}</TableCell>
                          <TableCell>{getExpenseItemsSummary(expense.items)}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(expense.totalAmount)}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Buka menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className='glass-dialog'>
                                  <DropdownMenuItem onClick={() => handleEditExpense(expense)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    <span>Edit</span>
                                  </DropdownMenuItem>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-500 focus:bg-red-500/20 focus:text-red-500">
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        <span>Hapus</span>
                                      </DropdownMenuItem>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Anda yakin?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tindakan ini tidak dapat diurungkan. Ini akan menghapus data pengeluaran secara permanen.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Batal</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteExpense(expense.id)}>Hapus</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </DropdownMenuContent>
                              </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))) : (<TableRow><TableCell colSpan={4} className="h-24 text-center">{(expenses || []).length > 0 ? 'Tidak ada pengeluaran yang cocok.' : 'Belum ada pengeluaran yang dicatat.'}</TableCell></TableRow>)}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
        
      {activeTab === 'sales' && (
        <Dialog open={isAddSaleDialogOpen} onOpenChange={setIsAddSaleDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 md:hidden">
              <PlusCircle className="h-6 w-6" />
              <span className="sr-only">Catat Penjualan</span>
            </Button>
          </DialogTrigger>
          <SaleForm open={isAddSaleDialogOpen} onOpenChange={setIsAddSaleDialogOpen} customers={customers || []} availableStock={availableStock} onActionSuccess={onActionSuccess} allSales={sales || []} />
        </Dialog>
      )}

      {activeTab === 'expenses' && (
        <Dialog open={isAddExpenseDialogOpen} onOpenChange={setIsAddExpenseDialogOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-40 md:hidden">
              <PlusCircle className="h-6 w-6" />
              <span className="sr-only">Catat Pengeluaran</span>
            </Button>
          </DialogTrigger>
          <ExpenseForm open={isAddExpenseDialogOpen} onOpenChange={setIsAddExpenseDialogOpen} onActionSuccess={onActionSuccess} allExpenses={expenses || []} />
        </Dialog>
      )}
    </div>
  );
}
