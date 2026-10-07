# WCAG 2.2 AA manual audit — 2026-10-07

## Scope and method

- Target: authenticated production app at `https://quanlykhopiopio.vercel.app`.
- Desktop manual/AX inspection: Home, Sale, Orders, Products, Customers, customer import/export, received-note form, Notes, transaction form, Reports, Config, Permissions and Help.
- Mobile reflow: 390×844 on Home, Sale, Orders, Products, Customers, customer export, received-note form, Notes, Reports and Config.
- Manual keyboard sampling: Sale toolbar, order tabs, segments and form controls; modal implementation review for custom dialogs.
- Visual/computed checks: accessible names, semantic headings, image alternatives, focus target order, target dimensions, horizontal overflow and computed text contrast.
- Assistive inspection used the browser accessibility tree. A full human VoiceOver/NVDA/JAWS session was not available, so screen-reader-specific speech and rotor behavior remain to be verified.

## Evidence matrix

| WCAG area | Evidence/result | Status after this change |
|---|---|---|
| 1.1.1 Non-text content | Visible images in 14 representative routes had `alt`; decorative icons are exposed inconsistently by Ionic but actionable icon buttons now have names | Pass in sampled routes |
| 1.3.1 Structure | Several pages exposed no heading because `ion-title` had generic semantics | Fixed globally: `ion-title` gets heading level 1 |
| 1.4.3 Contrast | `#6c757d` on white measured about 4.37:1; received-note total in yellow measured about 1.78:1; customer/export muted text was also below 4.5:1 | Fixed tokens/styles; production remeasurement pending deployment |
| 1.4.10 Reflow | No document-level horizontal overflow on ten representative routes at 390×844. Wide customer tables correctly switch to cards | Pass in sampled routes |
| 2.1.1 Keyboard | Sale controls expose keyboard focus; custom dialogs did not have a shared focus trap/restoration mechanism | Fixed for custom note/filter/barcode/QR dialogs |
| 2.1.2 No keyboard trap | Escape existed for Notes but not barcode/QR dialogs | Fixed Escape close for barcode and QR; Tab cycles within custom dialog |
| 2.2.2 Pause/stop/hide | Decorative animation existed without reduced-motion override | Fixed with `prefers-reduced-motion` |
| 2.4.1 Bypass blocks | No skip link | Fixed with “Bỏ qua menu, đến nội dung chính” |
| 2.4.3 Focus order | Sampled Sale order follows toolbar → order tabs → primary tabs → form. Ionic shadow inputs remain in logical DOM order | Pass in sampled flow |
| 2.4.7 Focus visible / 2.4.11 not obscured | Some controls relied on browser/Ionic 1px focus indication | Fixed with 3px high-contrast focus ring and offset |
| 2.5.8 Target size | Sampled interactive targets were generally at least 24×24; export reorder controls are 30×30 | Pass in sampled routes |
| 3.3.2 Labels | Export-column checkboxes and reorder controls lacked individual accessible names; several Sale icon controls depended on runtime inference | Fixed with explicit contextual labels |
| 4.1.2 Name, role, value | Blank menu/header buttons were found in AX sampling; app already had a runtime icon label safety net, but it omitted `ion-menu-button` | Fixed globally and explicitly on critical screens |
| 4.1.3 Status messages | Form errors/success and export completion were not consistently live regions | Fixed with alert/status live-region semantics |

## Changes made

- Added a keyboard skip link and semantic `main` landmark.
- Added visible high-contrast focus styling and reduced-motion behavior.
- Added heading semantics and live-region semantics through the shared accessibility service.
- Added custom-dialog initial focus, Tab/Shift+Tab containment and focus restoration.
- Added Escape handling and modal semantics to barcode and payment-QR dialogs.
- Added explicit, contextual accessible names to Sale and customer-export controls.
- Increased muted-text contrast and replaced the inaccessible yellow total color.
- Preserved responsive layouts; no new horizontal overflow was observed by build-time review.

## Remaining verification

- Repeat the same contrast and accessibility-tree sampling after production deployment.
- Run at least one complete flow with VoiceOver on Safari and NVDA on Windows/Chrome; automated AX inspection does not prove screen-reader usability.
- Destructive dialogs and camera/contact-picker permission prompts require device-level testing and were not activated against production data.
- The audit is broad and evidence-based, but it is not a certification that every state of every route conforms to WCAG 2.2 AA.
