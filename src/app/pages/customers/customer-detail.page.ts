import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, arrowBackOutline, attachOutline, callOutline, copyOutline, createOutline, documentTextOutline, downloadOutline, homeOutline, mailOutline, sendOutline, trashOutline } from 'ionicons/icons';
import { Customer, CustomerAttachment, CustomerDebtEntry, CustomerInteraction, Order } from '../../core/models/models';
import { CustomersService } from '../../core/services/customers.service';
import { OrdersService } from '../../core/services/orders.service';

type DetailTab = 'overview' | 'orders' | 'debt' | 'files';
@Component({
  selector: 'app-customer-detail', templateUrl: './customer-detail.page.html', styleUrls: ['./customer-detail.page.scss'],
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonContent, IonSpinner],
})
export class CustomerDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute); private readonly router = inject(Router);
  private readonly customers = inject(CustomersService); private readonly ordersService = inject(OrdersService);
  private readonly alerts = inject(AlertController); private readonly toasts = inject(ToastController);
  readonly customer = signal<Customer | null>(null); readonly orders = signal<Order[]>([]);
  readonly interactions = signal<CustomerInteraction[]>([]); readonly ledger = signal<CustomerDebtEntry[]>([]);
  readonly files = signal<CustomerAttachment[]>([]); readonly loading = signal(true); readonly busy = signal(false);
  readonly tab = signal<DetailTab>('overview'); readonly noteSaving = signal(false); readonly uploadBusy = signal(false);
  customerId = ''; note = ''; tagDraft = '';
  constructor(){ addIcons({arrowBackOutline,homeOutline,createOutline,trashOutline,callOutline,mailOutline,copyOutline,attachOutline,documentTextOutline,sendOutline,addOutline,downloadOutline}); }
  ngOnInit(): void { this.customerId = this.route.snapshot.paramMap.get('id') ?? ''; if(this.customerId) void this.load(); }
  async load(): Promise<void> {
    this.loading.set(true);
    try { const [customer,orders,interactions,ledger,files] = await Promise.all([this.customers.get(this.customerId),this.ordersService.listByCustomer(this.customerId,50).catch(()=>[]),this.customers.interactions(this.customerId).catch(()=>[]),this.customers.debtLedger(this.customerId).catch(()=>[]),this.customers.attachments(this.customerId).catch(()=>[])]); this.customer.set(customer); this.orders.set(orders); this.interactions.set(interactions); this.ledger.set(ledger); this.files.set(files); }
    catch(error:any){ await this.toast(error?.message??'Không tải được hồ sơ khách hàng.','danger'); }
    finally{ this.loading.set(false); }
  }
  setTab(tab:DetailTab):void{this.tab.set(tab);}
  initial(name:string):string{return name?.trim().charAt(0).toUpperCase()||'?';}
  money(value:number|null|undefined):string{return new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND',maximumFractionDigits:0}).format(Number(value??0));}
  date(value:string|null|undefined):string{return value?new Intl.DateTimeFormat('vi-VN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'—';}
  tierLabel(tier:Customer['tier']):string{return ({bronze:'Đồng',silver:'Bạc',gold:'Vàng'} as any)[tier??'bronze']??'Đồng';}
  statusLabel(status:Customer['status']):string{return ({lead:'Tiềm năng',active:'Hoạt động',inactive:'Ngừng hoạt động'} as any)[status??'active']??'Hoạt động';}
  interactionLabel(type:CustomerInteraction['type']):string{return ({note:'Ghi chú',call:'Cuộc gọi',email:'Email',system:'Hệ thống',visit:'Ghé thăm'} as any)[type]??type;}
  goBack():void{void this.router.navigateByUrl('/contact',{replaceUrl:true});} openHome():void{void this.router.navigateByUrl('/home');}
  openEdit():void{void this.router.navigateByUrl(`/contact/${this.customerId}`);} openOrder(order:Order):void{void this.router.navigateByUrl(`/order/detail/${order.id}`);}
  async copyPhone():Promise<void>{const phone=this.customer()?.phone;if(!phone)return;await navigator.clipboard.writeText(phone);await this.toast('Đã sao chép số điện thoại');}
  async addTag():Promise<void>{const c=this.customer();const tag=this.tagDraft.trim();if(!c||!tag)return;const tags=Array.from(new Set([...(c.tags??[]),tag])).slice(0,20);this.customer.set({...c,tags});this.tagDraft='';try{await this.customers.update(c.id,{tags});}catch(error:any){this.customer.set(c);await this.toast(error?.message??'Không lưu được thẻ. Hãy chạy migration v31.','danger');}}
  async removeTag(tag:string):Promise<void>{const c=this.customer();if(!c)return;const tags=(c.tags??[]).filter(v=>v!==tag);this.customer.set({...c,tags});try{await this.customers.update(c.id,{tags});}catch(error:any){this.customer.set(c);await this.toast(error?.message??'Không lưu được thẻ.','danger');}}
  async addNote():Promise<void>{const content=this.note.trim();if(!content||this.noteSaving())return;const optimistic:CustomerInteraction={id:`tmp-${Date.now()}`,shop_id:'',customer_id:this.customerId,type:'note',content,created_at:new Date().toISOString(),created_by_name:'Bạn'};this.note='';this.interactions.update(v=>[optimistic,...v]);this.noteSaving.set(true);try{const saved=await this.customers.addInteraction(this.customerId,content);this.interactions.update(v=>v.map(i=>i.id===optimistic.id?saved:i));}catch(error:any){this.interactions.update(v=>v.filter(i=>i.id!==optimistic.id));this.note=content;await this.toast(error?.message??'Không thêm được ghi chú. Hãy chạy migration v31.','danger');}finally{this.noteSaving.set(false);}}
  async adjustDebt(type:'charge'|'payment'):Promise<void>{const c=this.customer();if(!c)return;const alert=await this.alerts.create({header:type==='payment'?'Ghi nhận thu nợ':'Tăng công nợ',inputs:[{name:'amount',type:'number',min:1,placeholder:'Số tiền *'},{name:'note',type:'text',placeholder:'Ghi chú'}],buttons:[{text:'Hủy',role:'cancel'},{text:'Lưu',handler:(data)=>{const amount=Number(data.amount);if(!(amount>0))return false;void this.doAdjustDebt(type,amount,String(data.note??''));return true;}}]});await alert.present();}
  private async doAdjustDebt(type:'charge'|'payment',amount:number,note:string):Promise<void>{try{const balance=await this.customers.adjustDebt(this.customerId,amount,type,note);this.customer.update(c=>c?{...c,debt:balance}:c);this.ledger.set(await this.customers.debtLedger(this.customerId));await this.toast('Đã cập nhật công nợ');}catch(error:any){await this.toast(error?.message??'Cập nhật công nợ thất bại.','danger');}}
  async upload(event:Event):Promise<void>{const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;this.uploadBusy.set(true);try{const saved=await this.customers.uploadAttachment(this.customerId,file);this.files.update(v=>[saved,...v]);await this.toast('Đã tải tệp lên');}catch(error:any){await this.toast(error?.message??'Tải tệp thất bại. Hãy chạy migration v31.','danger');}finally{this.uploadBusy.set(false);}}
  async openFile(file:CustomerAttachment):Promise<void>{try{window.open(await this.customers.signedAttachmentUrl(file.file_path),'_blank','noopener');}catch(error:any){await this.toast(error?.message??'Không mở được tệp.','danger');}}
  async confirmDelete():Promise<void>{const c=this.customer();if(!c)return;const alert=await this.alerts.create({header:'Xóa khách hàng',message:`“${c.name}” sẽ được đưa vào trạng thái đã xóa và không xuất hiện trong danh sách.`,buttons:[{text:'Hủy',role:'cancel'},{text:'Xóa',role:'destructive',handler:()=>{void this.doDelete();}}]});await alert.present();}
  private async doDelete():Promise<void>{this.busy.set(true);try{await this.customers.remove(this.customerId);await this.toast('Đã xóa khách hàng');this.goBack();}catch(error:any){await this.toast(error?.message??'Xóa thất bại.','danger');}finally{this.busy.set(false);}}
  private async toast(message:string,color='success'):Promise<void>{const t=await this.toasts.create({message,color,duration:2200,position:'bottom'});await t.present();}
}
