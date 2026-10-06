import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonSpinner, IonTitle, IonToolbar, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { arrowBackOutline, checkmarkCircleOutline, cloudUploadOutline, downloadOutline, homeOutline } from 'ionicons/icons';
import { CUSTOMER_IMPORT_FIELDS, CustomerImportField, CustomerImportRow, autoMapCustomerHeaders, parseCustomerRows } from '../../core/customer-tools';
import { CustomersService, CustomerImportResult } from '../../core/services/customers.service';
import { ExcelIoService, ParsedExcelSheet } from '../../core/services/excel-io.service';

@Component({
  selector: 'app-customer-import',
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonButtons, IonButton, IonIcon, IonTitle, IonContent, IonSpinner],
  template: `
    <ion-header><ion-toolbar><ion-buttons slot="start"><ion-button (click)="back()"><ion-icon slot="icon-only" name="arrow-back-outline" /></ion-button><ion-button (click)="home()"><ion-icon slot="icon-only" name="home-outline" /></ion-button></ion-buttons><ion-title>Nhập khách hàng từ file Excel</ion-title></ion-toolbar></ion-header>
    <ion-content class="app-page"><div class="import-shell">
      <section class="intro-card">
        <p>Để hệ thống hiểu được file của bạn, hãy dùng đúng tiêu đề cột. Trường bắt buộc là <b>“Họ tên”</b>; Mã khách hàng, SĐT và Email nên duy nhất.</p>
        <button class="outline teal" (click)="downloadTemplate()"><ion-icon name="download-outline" /> TẢI MẪU EXCEL</button>
        <label class="upload"><ion-icon name="cloud-upload-outline" /><span>{{fileName()||'UPLOAD FILE KHÁCH HÀNG'}}</span><input type="file" accept=".xlsx,.xls,.csv" (change)="pickFile($event)" /></label>
        <small>Hỗ trợ .xlsx, .xls, .csv · tối đa 10 MB · tối đa 2.000 dòng/lần.</small>
      </section>

      @if(loading()){<div class="loading"><ion-spinner name="crescent" /> Đang đọc và kiểm tra file…</div>}
      @if(sheets().length){
        <section class="work-card">
          <div class="step"><b>1</b><div><h2>Chọn sheet và dòng tiêu đề</h2><p>Kiểm tra đúng sheet trước khi ánh xạ.</p></div></div>
          <div class="grid two"><label>Sheet<select [(ngModel)]="sheetIndex" (change)="selectSheet()">@for(sheet of sheets();track sheet.name;let i=$index){<option [value]="i">{{sheet.name}}</option>}</select></label><label>Dòng tiêu đề<input type="number" min="1" max="30" [(ngModel)]="headerRowUi" (change)="changeHeaderRow()" /></label></div>
          <div class="step"><b>2</b><div><h2>Ánh xạ cột</h2><p>Chỉ “Họ tên” là bắt buộc.</p></div></div>
          <div class="mapping-grid">@for(field of fields;track field.key){<label>{{field.label}}<select [ngModel]="mapping()[field.key]" (ngModelChange)="setMapping(field.key,$event)"><option [ngValue]="-1">— Bỏ qua —</option>@for(header of headers();track $index;let i=$index){<option [ngValue]="i">{{header||'Cột '+(i+1)}}</option>}</select></label>}</div>
          <div class="step"><b>3</b><div><h2>Xem trước và xử lý trùng</h2><p>File được kiểm tra trước khi gửi; lỗi hiển thị đúng số dòng.</p></div></div>
          <div class="grid two"><label>Khi trùng SĐT/Email/Mã<select [(ngModel)]="strategy"><option value="skip">Bỏ qua bản ghi trùng</option><option value="update">Cập nhật bản ghi hiện có</option></select></label><div class="summary"><strong>{{validRows().length}}</strong> hợp lệ · <strong [class.bad]="errors().length">{{errors().length}}</strong> lỗi</div></div>
          @if(errors().length){<div class="errors"><h3>Dòng cần sửa</h3>@for(error of errors().slice(0,20);track $index){<p>Dòng {{error.row}}: {{error.message}}</p>}@if(errors().length>20){<p>… và {{errors().length-20}} lỗi khác.</p>}</div>}
          @if(validRows().length){<div class="preview"><table><thead><tr><th>Dòng</th><th>Họ tên</th><th>SĐT</th><th>Email</th><th>Địa chỉ</th></tr></thead><tbody>@for(row of validRows().slice(0,10);track row.rowNumber){<tr><td>{{row.rowNumber}}</td><td>{{row.name}}</td><td>{{row.phone||'—'}}</td><td>{{row.email||'—'}}</td><td>{{row.address||'—'}}</td></tr>}</tbody></table></div>}
          <button class="primary" (click)="startImport()" [disabled]="busy()||!validRows().length||errors().length>0">@if(busy()){<ion-spinner name="crescent" />}@else{<ion-icon name="checkmark-circle-outline" />} BẮT ĐẦU NHẬP</button>
          @if(result();as value){<div class="result"><h3>Đã xử lý file</h3><p>Tạo mới {{value.created}} · Cập nhật {{value.updated}} · Bỏ qua {{value.skipped}} · Lỗi {{value.failed}}</p></div>}
        </section>
      }
    </div></ion-content>
  `,
  styles: [`
    ion-content{--background:#f5f7fb}.import-shell{max-width:1050px;margin:auto;padding:16px}.intro-card,.work-card{background:#fff;border:1px solid #e7e8ef;border-radius:16px;padding:18px;box-shadow:0 4px 20px rgba(34,29,70,.05);margin-bottom:14px}.intro-card p{margin:0 0 14px;line-height:1.55}.outline,.primary,.upload{min-height:46px;border-radius:10px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:800}.outline{width:100%;border:1px solid #43b8ad;background:#fff;color:#2c9f95}.upload{border:1px solid #6842ee;color:#6030ff;margin-top:14px;cursor:pointer}.upload input{display:none}.intro-card small{display:block;color:#73778b;margin-top:9px}.loading{display:flex;justify-content:center;gap:10px;padding:30px}.step{display:flex;gap:12px;margin:16px 0 10px}.step>b{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#6030ff;color:white}.step h2{font-size:16px;margin:2px 0}.step p{font-size:12px;color:#73778b;margin:3px 0}.grid.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mapping-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}label{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:#62677a}select,input{height:42px;border:1px solid #dfe1e9;border-radius:9px;background:#fff;padding:0 10px;color:#20243d}.summary{align-self:end;height:42px;display:flex;align-items:center;justify-content:center;background:#f6f4ff;border-radius:9px;color:#50458a}.summary strong{margin:0 4px}.bad{color:#c62828}.errors{background:#fff3f2;border:1px solid #ffd6d2;color:#9e2d24;padding:12px;border-radius:10px;max-height:230px;overflow:auto}.errors h3,.result h3{margin:0 0 7px;font-size:14px}.errors p{margin:3px 0;font-size:12px}.preview{overflow:auto;border:1px solid #e7e8ef;border-radius:10px;margin-top:12px}table{width:100%;border-collapse:collapse;min-width:700px}th,td{text-align:left;padding:9px;border-bottom:1px solid #eee;font-size:12px}.primary{width:100%;border:0;background:#6030ff;color:white;margin-top:14px}.primary:disabled{opacity:.45}.result{margin-top:12px;background:#eaf8ef;color:#17643b;padding:12px;border-radius:10px}@media(max-width:760px){.mapping-grid{grid-template-columns:1fr 1fr}.grid.two{grid-template-columns:1fr}}@media(max-width:460px){.mapping-grid{grid-template-columns:1fr}}
  `],
})
export class CustomerImportPage {
  private readonly excel=inject(ExcelIoService); private readonly customers=inject(CustomersService); private readonly router=inject(Router); private readonly toastCtrl=inject(ToastController);
  readonly fields=CUSTOMER_IMPORT_FIELDS; readonly sheets=signal<ParsedExcelSheet[]>([]); readonly fileName=signal(''); readonly loading=signal(false); readonly busy=signal(false); readonly result=signal<CustomerImportResult|null>(null); readonly mapping=signal<Record<CustomerImportField,number>>({name:-1,code:-1,phone:-1,email:-1,address:-1,gender:-1,dob:-1,important:-1});
  sheetIndex=0; headerRowUi=1; strategy:'skip'|'update'='skip'; private idempotencyKey=crypto.randomUUID();
  readonly currentSheet=computed(()=>this.sheets()[Number(this.sheetIndex)]??null); readonly headers=computed(()=>this.currentSheet()?.rows[Math.max(0,this.headerRowUi-1)]??[]);
  readonly parsed=computed(()=>parseCustomerRows(this.currentSheet()?.rows??[],Math.max(0,this.headerRowUi-1),this.mapping(),(value)=>this.excel.date(value)));
  readonly validRows=computed(()=>this.parsed().rows); readonly errors=computed(()=>this.parsed().errors);
  constructor(){addIcons({arrowBackOutline,homeOutline,cloudUploadOutline,downloadOutline,checkmarkCircleOutline});}
  back(){void this.router.navigateByUrl('/contact');} home(){void this.router.navigateByUrl('/home');}
  async pickFile(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;this.loading.set(true);this.result.set(null);try{const workbook=await this.excel.readWorkbook(file);this.sheets.set(workbook.sheets);this.fileName.set(file.name);this.sheetIndex=0;this.headerRowUi=this.detectHeader(workbook.sheets[0]);this.applyAutoMap();this.idempotencyKey=crypto.randomUUID();}catch(error:any){await this.toast(error?.message??'Không đọc được file.','danger');}finally{this.loading.set(false);}}
  detectHeader(sheet:ParsedExcelSheet):number{for(let i=0;i<Math.min(30,sheet.rows.length);i++){if(autoMapCustomerHeaders(sheet.rows[i]).name>=0)return i+1;}return 1;}
  selectSheet(){const sheet=this.currentSheet();if(sheet){this.headerRowUi=this.detectHeader(sheet);this.applyAutoMap();}}
  changeHeaderRow(){this.headerRowUi=Math.min(30,Math.max(1,Number(this.headerRowUi)||1));this.applyAutoMap();}
  applyAutoMap(){this.mapping.set(autoMapCustomerHeaders(this.headers()));}
  setMapping(field:CustomerImportField,index:number){this.mapping.update(value=>({...value,[field]:Number(index)}));}
  downloadTemplate(){this.excel.download('mau-nhap-khach-hang','Khách hàng',[this.fields.map(field=>field.label.replace(' *','')),['Nguyễn Văn A','CUST001','0912345678','a@example.com','12 Nguyễn Huệ','Nam','1990-01-31','Có']]);}
  async startImport(){if(this.errors().length||!this.validRows().length)return;this.busy.set(true);try{const result=await this.customers.importBatch(this.validRows(),this.strategy,this.idempotencyKey,this.fileName());this.result.set(result);await this.toast(`Đã nhập: ${result.created} mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua.`);}catch(error:any){await this.toast(error?.message??'Nhập khách hàng thất bại. Hãy chạy migration v33.','danger');}finally{this.busy.set(false);}}
  private async toast(message:string,color='success'){const toast=await this.toastCtrl.create({message,color,duration:2600,position:'bottom'});await toast.present();}
}
