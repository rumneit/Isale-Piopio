import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonFab, IonFabButton,
  IonHeader, IonIcon, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner, IonTitle,
  IonToolbar, ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, bookOutline, closeOutline, createOutline, homeOutline, imageOutline,
  saveOutline, star, starOutline, trashOutline,
} from 'ionicons/icons';
import { Customer } from '../../core/models/models';
import { CustomersService } from '../../core/services/customers.service';
import { NotesService, PhotoNote, PhotoNoteImage } from '../../core/services/notes.service';

type NoteFilter = 'regular' | 'vip' | 'recent';
type EditorTab = 'content' | 'images';

@Component({
  selector: 'app-notes',
  imports: [
    CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton,
    IonButton, IonIcon, IonContent, IonSearchbar, IonSegment, IonSegmentButton, IonSpinner,
    IonFab, IonFabButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home" />
          <ion-button aria-label="Trang chủ" (click)="router.navigateByUrl('/home')"><ion-icon slot="icon-only" name="home-outline" /></ion-button>
        </ion-buttons>
        <ion-title>Ghi chú - Ảnh</ion-title>
      </ion-toolbar>
      <ion-toolbar class="tabs-toolbar">
        <ion-segment [value]="filter()" (ionChange)="setFilter($any($event).detail.value)">
          <ion-segment-button value="regular">Thường xuyên</ion-segment-button>
          <ion-segment-button value="vip">VIP</ion-segment-button>
          <ion-segment-button value="recent">Gần đây</ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar placeholder="Tìm ghi chú" [debounce]="250" (ionInput)="search.set($any($event).detail.value || '')" />
        <span class="count" slot="end">{{ filtered().length }} ghi chú</span>
      </ion-toolbar>
    </ion-header>

    <ion-content class="app-page">
      <main class="notes-shell">
        @if (loading()) {
          <div class="state"><ion-spinner name="crescent" /><span>Đang tải ghi chú…</span></div>
        } @else if (filtered().length === 0) {
          <div class="state empty">
            <ion-icon name="book-outline" />
            <h2>Chưa có ghi chú</h2>
            <p>Tạo ghi chú văn bản hoặc ảnh để theo dõi thông tin quan trọng.</p>
            <ion-button (click)="openEditor()"><ion-icon name="add-outline" slot="start" />Thêm ghi chú</ion-button>
          </div>
        } @else {
          <section class="note-grid" aria-label="Danh sách ghi chú">
            @for (note of filtered(); track note.id) {
              <article class="note-card">
                <header>
                  <div>
                    <h2>{{ note.title }}</h2>
                    <small>{{ note.created_at | date:'dd/MM/yyyy HH:mm' }}{{ customerName(note) ? ' · ' + customerName(note) : '' }}</small>
                  </div>
                  @if (note.important) { <ion-icon class="important" name="star" aria-label="VIP" /> }
                </header>
                @if (note.content) { <p class="note-copy">{{ note.content }}</p> }
                @if (note.images?.length) {
                  <div class="thumbs">
                    @for (image of note.images!.slice(0, 4); track image.id; let last = $last) {
                      <button type="button" (click)="viewImage(image)" [attr.aria-label]="'Xem ' + image.file_name">
                        @if (imageUrls()[image.id]) { <img [src]="imageUrls()[image.id]" [alt]="image.file_name" /> }
                        @else { <ion-icon name="image-outline" /> }
                        @if (last && note.images!.length > 4) { <span>+{{ note.images!.length - 4 }}</span> }
                      </button>
                    }
                  </div>
                }
                <footer>
                  @if (note.recurring) { <span class="chip">Thường xuyên</span> } @else { <span></span> }
                  <div>
                    <ion-button fill="clear" size="small" aria-label="Sửa ghi chú" (click)="openEditor(note)"><ion-icon slot="icon-only" name="create-outline" /></ion-button>
                    <ion-button fill="clear" size="small" color="danger" aria-label="Xóa ghi chú" (click)="confirmDelete(note)"><ion-icon slot="icon-only" name="trash-outline" /></ion-button>
                  </div>
                </footer>
              </article>
            }
          </section>
        }
      </main>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end"><ion-fab-button aria-label="Thêm ghi chú" (click)="openEditor()"><ion-icon name="add-outline" /></ion-fab-button></ion-fab>
    </ion-content>

    @if (editing()) {
      <div class="editor-backdrop" (click)="closeEditor()"></div>
      <section class="editor" role="dialog" aria-modal="true" aria-labelledby="note-editor-title">
        <header class="editor-head">
          <ion-button fill="clear" color="dark" (click)="closeEditor()"><ion-icon name="close-outline" slot="start" />BỎ QUA</ion-button>
          <h2 id="note-editor-title">{{ draftId ? 'Sửa ghi chú' : 'Thêm ghi chú' }}</h2>
          <ion-button fill="clear" color="dark" [disabled]="saving()" (click)="save()"><ion-icon name="save-outline" slot="start" />LƯU</ion-button>
        </header>
        <div class="editor-body">
          <label>Khách hàng
            <select [(ngModel)]="draftCustomerId">
              <option value="">Không gắn khách hàng</option>
              @for (customer of customers(); track customer.id) { <option [value]="customer.id">{{ customer.name }}{{ customer.phone ? ' · ' + customer.phone : '' }}</option> }
            </select>
          </label>
          <div class="switch-row">
            <label><input type="checkbox" [(ngModel)]="draftImportant" /> VIP</label>
            <label><input type="checkbox" [(ngModel)]="draftRecurring" /> Thường xuyên</label>
          </div>
          <div class="editor-tabs">
            <button type="button" [class.active]="editorTab() === 'content'" (click)="editorTab.set('content')">Nội dung</button>
            <button type="button" [class.active]="editorTab() === 'images'" (click)="editorTab.set('images')">Ảnh ({{ keptImages.length + files.length }})</button>
          </div>
          @if (editorTab() === 'content') {
            <textarea [(ngModel)]="draftContent" maxlength="5000" placeholder="Nhập nội dung" autofocus></textarea>
          } @else {
            <label class="drop-zone">
              <ion-icon name="image-outline" />
              <strong>THÊM ẢNH</strong>
              <span>JPG, PNG, WebP hoặc GIF · tối đa 8 MB/ảnh</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple (change)="chooseFiles($any($event))" />
            </label>
            <div class="preview-grid">
              @for (image of keptImages; track image.id) {
                <figure><img [src]="imageUrls()[image.id]" [alt]="image.file_name" /><button type="button" (click)="removeKept(image)" aria-label="Bỏ ảnh"><ion-icon name="close-outline" /></button></figure>
              }
              @for (preview of previews; track preview.url; let i = $index) {
                <figure><img [src]="preview.url" [alt]="preview.file.name" /><button type="button" (click)="removeNew(i)" aria-label="Bỏ ảnh"><ion-icon name="close-outline" /></button></figure>
              }
            </div>
          }
        </div>
        @if (saving()) { <div class="saving"><ion-spinner name="crescent" /> Đang lưu và tải ảnh…</div> }
      </section>
    }
  `,
  styles: [`
    :host ion-content { --background: var(--app-page-bg); } .tabs-toolbar ion-segment{max-width:620px;margin:auto}.count{padding-right:18px;font-size:13px;color:var(--app-text-muted)}
    .notes-shell{max-width:1180px;margin:auto;padding:18px}.state{min-height:52vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;color:var(--app-text-muted)}.state>ion-icon{font-size:54px;color:var(--ion-color-primary)}.state h2{margin:0;color:var(--app-text);font-size:20px}.state p{margin:0 0 8px}
    .note-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}.note-card{background:var(--app-surface,#fff);border:1px solid var(--app-border,#e4e5eb);border-radius:14px;padding:16px;box-shadow:0 3px 14px rgba(35,31,59,.06)}.note-card header,.note-card footer{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.note-card h2{font-size:15px;margin:0 0 4px;color:var(--app-text)}.note-card small{color:var(--app-text-muted)}.important{color:#f2a900;font-size:20px}.note-copy{white-space:pre-wrap;line-height:1.5;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.thumbs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}.thumbs button{position:relative;border:0;padding:0;aspect-ratio:1;border-radius:8px;overflow:hidden;background:#eee;color:#777}.thumbs img{width:100%;height:100%;object-fit:cover}.thumbs span{position:absolute;inset:0;display:grid;place-items:center;background:#0008;color:#fff;font-weight:700}.note-card footer{align-items:center;margin-top:8px}.chip{font-size:11px;background:#eee9ff;color:#5b3fd0;padding:4px 8px;border-radius:999px}
    .editor-backdrop{position:fixed;z-index:1000;inset:0;background:#25233173}.editor{position:fixed;z-index:1001;inset:5vh max(5vw,24px);max-width:1100px;margin:auto;background:#fff;border-radius:6px;box-shadow:0 20px 70px #20202f55;overflow:auto}.editor-head{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:12px 18px;border-bottom:1px solid #ddd;background:#fff}.editor-head h2{font-size:20px;margin:0}.editor-head ion-button:last-child{justify-self:end}.editor-body{padding:28px 34px}.editor-body>label{display:grid;gap:8px;font-weight:600;color:#413c50}.editor-body select{height:46px;border:1px solid #c9c7cf;border-radius:8px;padding:0 12px;background:white}.switch-row{display:flex;gap:28px;margin:22px 0}.switch-row label{display:flex;align-items:center;gap:8px}.switch-row input{width:20px;height:20px;accent-color:var(--ion-color-primary)}.editor-tabs{display:flex;border-bottom:1px solid #ddd}.editor-tabs button{background:none;border:0;padding:13px 20px;font-weight:600;color:#777;border-bottom:3px solid transparent}.editor-tabs button.active{color:var(--ion-color-primary);border-color:var(--ion-color-primary)}textarea{width:100%;min-height:280px;border:1px solid #ccc;border-radius:8px;margin-top:18px;padding:14px;font:inherit;resize:vertical}.drop-zone{margin-top:18px;min-height:150px;border:2px dashed #c8c3da;border-radius:12px;display:flex!important;align-items:center;justify-content:center;color:#5d46c6!important;cursor:pointer}.drop-zone ion-icon{font-size:32px}.drop-zone span{font-size:12px;color:#777}.drop-zone input{position:absolute;opacity:0;width:1px;height:1px}.preview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px;margin-top:16px}.preview-grid figure{position:relative;margin:0;aspect-ratio:1}.preview-grid img{width:100%;height:100%;object-fit:cover;border-radius:10px}.preview-grid button{position:absolute;right:6px;top:6px;width:30px;height:30px;border:0;border-radius:50%;background:#252331cc;color:#fff}.saving{position:sticky;bottom:0;padding:12px;background:#f5f2ff;color:#4e37bd;text-align:center}
    @media(max-width:640px){.notes-shell{padding:10px}.note-grid{grid-template-columns:1fr}.editor{inset:0;border-radius:0}.editor-head{padding:8px 4px}.editor-head h2{font-size:17px}.editor-head ion-button{font-size:11px}.editor-body{padding:18px 16px}.count{display:none}}
  `],
})
export class NotesPage implements OnInit, OnDestroy {
  readonly router = inject(Router);
  private readonly notesService = inject(NotesService);
  private readonly customersService = inject(CustomersService);
  private readonly alerts = inject(AlertController);
  private readonly toasts = inject(ToastController);
  readonly notes = signal<PhotoNote[]>([]); readonly customers = signal<Customer[]>([]);
  readonly loading = signal(true); readonly saving = signal(false); readonly search = signal('');
  readonly filter = signal<NoteFilter>('regular'); readonly editing = signal(false); readonly editorTab = signal<EditorTab>('content');
  readonly imageUrls = signal<Record<string,string>>({});
  draftId = ''; draftContent = ''; draftCustomerId = ''; draftImportant = false; draftRecurring = false;
  keptImages: PhotoNoteImage[] = []; files: File[] = []; previews: Array<{file:File;url:string}> = [];
  private originalFingerprint = '';

  constructor(){ addIcons({addOutline,bookOutline,closeOutline,createOutline,homeOutline,imageOutline,saveOutline,star,starOutline,trashOutline}); }
  ngOnInit(){ void this.load(); }
  ngOnDestroy(){ this.clearPreviews(); }
  filtered(): PhotoNote[] {
    const q=this.search().trim().toLocaleLowerCase('vi');
    return this.notes().filter(n => this.filter()==='vip' ? n.important : this.filter()==='recent' ? true : n.recurring)
      .filter(n => !q || `${n.title} ${n.content??''}`.toLocaleLowerCase('vi').includes(q))
      .slice(0,this.filter()==='recent'?30:undefined);
  }
  setFilter(value: NoteFilter){ if(value) this.filter.set(value); }
  customerName(note:PhotoNote){ return this.customers().find(c=>c.id===note.customer_id)?.name??''; }
  async load(){ this.loading.set(true); try{ const [notes,customers]=await Promise.all([this.notesService.list(),this.customersService.listAll({pageSize:100})]); this.notes.set(notes);this.customers.set(customers);await this.hydrateImages(notes); }catch(e:any){await this.toast(e?.message??'Không tải được ghi chú','danger');}finally{this.loading.set(false);} }
  private async hydrateImages(notes:PhotoNote[]){ const entries=await Promise.all(notes.flatMap(n=>(n.images??[]).map(async i=>[i.id,await this.notesService.signedUrl(i.file_path)] as const)));this.imageUrls.set(Object.fromEntries(entries)); }
  openEditor(note?:PhotoNote){this.clearPreviews();this.draftId=note?.id??'';this.draftContent=note?.content??'';this.draftCustomerId=note?.customer_id??'';this.draftImportant=note?.important??false;this.draftRecurring=note?.recurring??false;this.keptImages=[...(note?.images??[])];this.files=[];this.editorTab.set('content');this.originalFingerprint=this.fingerprint();this.editing.set(true);}
  async closeEditor(force=false){if(this.saving())return;if(!force&&this.fingerprint()!==this.originalFingerprint){const alert=await this.alerts.create({header:'Bỏ thay đổi?',message:'Nội dung hoặc ảnh chưa được lưu sẽ bị mất.',buttons:[{text:'Tiếp tục sửa',role:'cancel'},{text:'Bỏ thay đổi',role:'destructive',handler:()=>{void this.closeEditor(true);}}]});await alert.present();return;}this.editing.set(false);this.clearPreviews();}
  @HostListener('document:keydown.escape') onEscape(){if(this.editing())void this.closeEditor();}
  private fingerprint(){return JSON.stringify([this.draftContent,this.draftCustomerId,this.draftImportant,this.draftRecurring,this.keptImages.map(image=>image.id),this.files.map(file=>`${file.name}:${file.size}:${file.lastModified}`)]);}
  chooseFiles(event:Event){const input=event.target as HTMLInputElement;for(const file of Array.from(input.files??[])){if(this.keptImages.length+this.files.length>=10){void this.toast('Tối đa 10 ảnh cho một ghi chú.','warning');break;}if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)||file.size>8*1024*1024){void this.toast(`Ảnh “${file.name}” không hợp lệ hoặc vượt quá 8 MB.`,'danger');continue;}this.files.push(file);this.previews.push({file,url:URL.createObjectURL(file)});}input.value='';}
  removeKept(image:PhotoNoteImage){this.keptImages=this.keptImages.filter(i=>i.id!==image.id);}
  removeNew(index:number){URL.revokeObjectURL(this.previews[index].url);this.previews.splice(index,1);this.files.splice(index,1);}
  private clearPreviews(){for(const preview of this.previews)URL.revokeObjectURL(preview.url);this.previews=[];this.files=[];}
  async save(){this.saving.set(true);try{await this.notesService.save({id:this.draftId||undefined,content:this.draftContent,customerId:this.draftCustomerId||null,important:this.draftImportant,recurring:this.draftRecurring,keepImages:this.keptImages,files:this.files});this.editing.set(false);this.clearPreviews();await this.load();await this.toast('Đã lưu ghi chú.');}catch(e:any){await this.toast(e?.message??'Lưu ghi chú thất bại.','danger');}finally{this.saving.set(false);}}
  async confirmDelete(note:PhotoNote){const alert=await this.alerts.create({header:'Xóa ghi chú',message:`Xóa “${note.title}” và toàn bộ ảnh đính kèm?`,buttons:[{text:'Hủy',role:'cancel'},{text:'Xóa',role:'destructive',handler:()=>{void this.deleteNote(note);}}]});await alert.present();}
  private async deleteNote(note:PhotoNote){try{await this.notesService.remove(note);await this.load();await this.toast('Đã xóa ghi chú.');}catch(e:any){await this.toast(e?.message??'Xóa thất bại.','danger');}}
  async viewImage(image:PhotoNoteImage){const url=this.imageUrls()[image.id]??await this.notesService.signedUrl(image.file_path);window.open(url,'_blank','noopener,noreferrer');}
  private async toast(message:string,color='success'){const toast=await this.toasts.create({message,color,duration:2200,position:'bottom'});await toast.present();}
}
