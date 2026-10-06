import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSegment, IonSegmentButton, IonSpinner, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { gitMergeOutline, homeOutline, peopleOutline, refreshOutline } from 'ionicons/icons';
import { DuplicateCandidate, DuplicateGroup, findDuplicates } from '../../core/duplicate-detection';
import { Customer } from '../../core/models/models';
import { CustomersService } from '../../core/services/customers.service';

type DuplicateTab = DuplicateGroup['reason'];

@Component({
  selector:'app-duplicate-customers',
  imports:[CommonModule,FormsModule,IonHeader,IonToolbar,IonButtons,IonBackButton,IonButton,IonIcon,IonTitle,IonContent,IonSegment,IonSegmentButton,IonSpinner],
  template:`
    <ion-header>
      <ion-toolbar><ion-buttons slot="start"><ion-back-button defaultHref="/contact" /><ion-button aria-label="Trang chủ" (click)="router.navigateByUrl('/home')"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons><ion-title>Lọc khách trùng</ion-title><ion-buttons slot="end"><ion-button (click)="scan()"><ion-icon name="refresh-outline" slot="start" />Quét lại</ion-button></ion-buttons></ion-toolbar>
      <ion-toolbar><ion-segment [value]="tab()" (ionChange)="tab.set($any($event).detail.value)"><ion-segment-button value="email">Theo email</ion-segment-button><ion-segment-button value="phone">Theo phone</ion-segment-button><ion-segment-button value="name">Theo tên</ion-segment-button></ion-segment></ion-toolbar>
    </ion-header>
    <ion-content class="app-page"><main class="shell">
      <div class="notice"><ion-icon name="git-merge-outline" /><div><b>Hợp nhất an toàn, không tự động xóa theo tên</b><p>Chọn bản ghi chính cho từng nhóm. Đơn hàng, công nợ, ghi chú, ảnh và lịch sử liên quan được chuyển trong cùng một giao dịch; bản phụ chỉ được xóa mềm.</p></div></div>
      @if(loading()){<div class="state"><ion-spinner name="crescent" /> Đang kiểm tra {{scanned()}} khách hàng…</div>}
      @else if(visibleGroups().length===0){<div class="state empty"><ion-icon name="people-outline" /><h2>Không có nhóm trùng {{tabLabel().toLowerCase()}}</h2><p>Đã kiểm tra {{scanned()}} khách hàng đang hoạt động.</p></div>}
      @else {<div class="summary">{{visibleGroups().length}} nhóm trùng · {{scanned()}} khách đã quét</div>
        @for(group of visibleGroups();track group.reason+group.key){
          <section class="group-card">
            <header><div><span class="badge">{{tabLabel()}}</span><strong>{{displayKey(group)}}</strong></div><span>{{group.items.length}} bản ghi</span></header>
            <div class="records">
              @for(customer of group.items;track customer.id){
                <label class="record" [class.primary]="primaryFor(group)===customer.id">
                  <input type="radio" [name]="group.reason+group.key" [value]="customer.id" [ngModel]="primaryFor(group)" (ngModelChange)="choosePrimary(group,$event)" />
                  <div class="avatar">{{customer.name.charAt(0).toUpperCase()}}</div>
                  <div><b>{{customer.name}}</b><span>{{customer.code||'Chưa có mã'}} · {{customer.phone||'Chưa có SĐT'}}</span><span>{{customer.email||'Chưa có email'}} · {{customer.address||'Chưa có địa chỉ'}}</span></div>
                  <div class="meta"><b>{{(customer.debt||0)|number:'1.0-0'}} ₫</b><span>{{primaryFor(group)===customer.id?'BẢN GHI CHÍNH':'SẼ HỢP NHẤT'}}</span></div>
                </label>
              }
            </div>
            <button class="merge" (click)="confirmMerge(group)" [disabled]="merging()"><ion-icon name="git-merge-outline" /> HỢP NHẤT {{group.items.length-1}} BẢN GHI VÀO BẢN CHÍNH</button>
          </section>
        }
      }
    </main></ion-content>
  `,
  styles:[`
    ion-content{--background:#f5f7fb}ion-segment{max-width:640px;margin:auto}.shell{max-width:1040px;margin:auto;padding:16px}.notice{display:flex;gap:12px;background:#fff9e8;border:1px solid #f3d78c;border-radius:12px;padding:13px;color:#664d0d}.notice ion-icon{font-size:24px}.notice p{margin:4px 0 0;font-size:12px;line-height:1.45}.state{min-height:45vh;display:flex;align-items:center;justify-content:center;gap:10px;color:#74788a}.empty{flex-direction:column;text-align:center}.empty ion-icon{font-size:54px;color:#6541e7}.empty h2,.empty p{margin:0}.summary{padding:14px 2px 8px;color:#686d7f;font-size:13px}.group-card{background:white;border:1px solid #e4e5ed;border-radius:14px;margin-bottom:14px;overflow:hidden;box-shadow:0 3px 15px rgba(30,25,65,.05)}.group-card>header{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:#fafafe;border-bottom:1px solid #eee}.group-card>header>div{display:flex;align-items:center;gap:10px}.group-card header>span{font-size:12px;color:#777}.badge{font-size:11px;font-weight:800;background:#eee9ff;color:#5c3bc5;border-radius:99px;padding:5px 9px}.records{padding:8px 14px}.record{display:grid;grid-template-columns:auto 42px 1fr auto;gap:10px;align-items:center;padding:11px;border:1px solid transparent;border-bottom-color:#eee;cursor:pointer}.record.primary{background:#f5f2ff;border-color:#cfc2ff;border-radius:10px}.record input{width:18px;height:18px;accent-color:#6030ff}.avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#ebe6ff;color:#5634c5;font-weight:800}.record>div:nth-child(3){display:flex;flex-direction:column;gap:3px}.record span{font-size:12px;color:#74788a}.meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px}.meta b{color:#ba2f37}.meta span{font-size:10px;font-weight:800;color:#5634c5}.merge{width:calc(100% - 28px);height:44px;margin:4px 14px 14px;border:0;border-radius:9px;background:#6030ff;color:white;font-weight:800;display:flex;align-items:center;justify-content:center;gap:8px}.merge:disabled{opacity:.45}@media(max-width:650px){.record{grid-template-columns:auto 38px 1fr}.meta{grid-column:3;align-items:flex-start}.group-card>header{align-items:flex-start}.group-card>header>div{align-items:flex-start;flex-direction:column;gap:5px}}
  `]
})
export class DuplicateCustomersPage implements OnInit{
  readonly router=inject(Router);private readonly customers=inject(CustomersService);private readonly alerts=inject(AlertController);private readonly toasts=inject(ToastController);
  readonly groups=signal<DuplicateGroup[]>([]);readonly loading=signal(true);readonly merging=signal(false);readonly scanned=signal(0);readonly tab=signal<DuplicateTab>('email');readonly primaryIds=signal<Record<string,string>>({});
  constructor(){addIcons({gitMergeOutline,homeOutline,peopleOutline,refreshOutline});}
  ngOnInit(){void this.scan();}
  visibleGroups(){return this.groups().filter(group=>group.reason===this.tab());}
  tabLabel(){return this.tab()==='phone'?'Theo phone':this.tab()==='email'?'Theo email':'Theo tên';}
  key(group:DuplicateGroup){return `${group.reason}:${group.key}`;}
  primaryFor(group:DuplicateGroup){return this.primaryIds()[this.key(group)]??group.items[0]?.id;}
  choosePrimary(group:DuplicateGroup,id:string){this.primaryIds.update(value=>({...value,[this.key(group)]:id}));}
  displayKey(group:DuplicateGroup){return group.reason==='phone'?group.items[0].phone:group.reason==='email'?group.items[0].email:group.items[0].name;}
  async scan(){this.loading.set(true);try{const customers=await this.customers.listAll({pageSize:100});this.scanned.set(customers.length);const groups=findDuplicates(customers as DuplicateCandidate[]);this.groups.set(groups);this.primaryIds.set(Object.fromEntries(groups.map(group=>[this.key(group),group.items[0].id])));}catch(error:any){await this.toast(error?.message??'Không thể quét khách trùng.','danger');this.groups.set([]);}finally{this.loading.set(false);}}
  async confirmMerge(group:DuplicateGroup){const primaryId=this.primaryFor(group);const primary=group.items.find(item=>item.id===primaryId);if(!primary)return;const alert=await this.alerts.create({header:'Xác nhận hợp nhất',message:`Giữ “${primary.name}” làm bản ghi chính và hợp nhất ${group.items.length-1} bản ghi còn lại? Dữ liệu liên quan sẽ được chuyển, các bản phụ được xóa mềm.`,buttons:[{text:'Hủy',role:'cancel'},{text:'Hợp nhất',handler:()=>{void this.merge(group,primaryId);}}]});await alert.present();}
  private async merge(group:DuplicateGroup,primaryId:string){this.merging.set(true);try{const primary=group.items.find(item=>item.id===primaryId) as Customer;const duplicates=group.items.filter(item=>item.id!==primaryId) as Customer[];await this.customers.merge(primaryId,duplicates,{name:primary.name,phone:primary.phone,email:primary.email,address:primary.address});await this.toast('Đã hợp nhất khách hàng và bảo toàn dữ liệu liên quan.');await this.scan();}catch(error:any){await this.toast(error?.message??'Hợp nhất thất bại. Dữ liệu có thể đã thay đổi; hãy quét lại.','danger');}finally{this.merging.set(false);}}
  private async toast(message:string,color='success'){const toast=await this.toasts.create({message,color,duration:2800,position:'bottom'});await toast.present();}
}
