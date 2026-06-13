# Product Requirements Document
## PVBudget — Event Budget Management System

**Version:** 1.0  
**Date:** June 2026  
**Status:** Live

---

## 1. Overview

PVBudget adalah sistem manajemen anggaran berbasis web untuk perusahaan event organizer. Sistem ini memungkinkan tim internal membuat, mengelola, dan menyetujui form budget acara melalui alur kerja multi-tahap, sekaligus melacak realisasi pengeluaran aktual dibandingkan dengan anggaran yang telah disetujui.

### 1.1 Tujuan
- Menstandarisasi proses pembuatan dan persetujuan budget acara
- Memberikan visibilitas penuh kepada manajemen terhadap status anggaran
- Melacak selisih antara anggaran yang disetujui dengan realisasi aktual
- Mendukung proses Purchase Order (PO) setelah budget disetujui

### 1.2 Pengguna Utama
- Tim Event (User/Manager): membuat dan mengelola budget
- Corporate/Management: menyetujui atau menolak budget
- Admin: mengelola sistem, user, dan divisi

---

## 2. Peran & Hak Akses

| Fitur | Admin | Corporate | Manager | User |
|---|:---:|:---:|:---:|:---:|
| Buat form budget | ✅ | ❌ | ✅ | ✅ |
| Edit form milik sendiri | ✅ | ❌ | ✅ | ✅ |
| Submit untuk approval | ✅ | ❌ | ✅ | ✅ |
| Approve form (1st/2nd) | ✅ | ✅ | ❌ | ❌ |
| Tolak/minta revisi | ✅ | ✅ | ❌ | ❌ |
| Unlock form approved | ✅ | ❌ | ❌ | ❌ |
| Hapus form | ✅ | ❌ | ❌ | ❌ |
| Lihat semua form | ✅ | ✅ | ✅* | ❌ |
| Lihat form sendiri | ✅ | ✅ | ✅ | ✅ |
| Lihat form approved | ✅ | ✅ | ✅ | ✅ |
| Input realisasi | ✅ | ❌ | ❌ | ✅** |
| Input PO Number | ✅ | ✅ | ✅ | ❌ |
| Kelola user & divisi | ✅ | ❌ | ❌ | ❌ |

\* Manager melihat form dari bawahan langsung dan divisi yang dikelola  
\** Hanya pemilik form pada status approved dengan realisasi aktif

---

## 3. Alur Kerja Utama

### 3.1 Siklus Hidup Form Budget

```
Draft
  │
  ▼ Submit
Pending Approval
  │                 │
  ▼ Approve (1st)   ▼ Reject
  │               Revision ──► Pending...
  ▼ Approve (2nd)
Approved
  │
  ├──► Create PO (opsional)
  ├──► Create Realisasi (opsional)
  └──► Unlock for Revision ──► Revision ──► Approved (baru)
                                              └── Approved lama → Archived
```

### 3.2 Proses Persetujuan 2 Tahap
1. **Stage 1**: Persetujuan pertama oleh Admin atau Corporate
2. **Stage 2**: Persetujuan kedua oleh Admin atau Corporate yang berbeda
3. Jika ditolak di tahap manapun, form dikembalikan ke status Revision dengan catatan revisi
4. Versi lama di-archive, versi baru dibuat dengan nomor versi bertambah

### 3.3 Alur Realisasi
1. Setelah form approved, pemilik form dapat mengaktifkan tab Realisasi
2. Di tab Realisasi, data budget dari form asal di-lock (read-only)
3. Pemilik mengisi kolom **Realisasi** (pengeluaran aktual) untuk setiap item
4. Item baru dapat ditambahkan di bawah data budget yang ada
5. Sistem menghitung selisih P/L (Profit/Loss) antara realisasi dan budget

### 3.4 Alur Purchase Order
1. Admin atau Manager membuat PO dari form yang sudah approved
2. PO Number dapat diisi per form maupun per baris item
3. Tab PO menampilkan semua item beserta kolom PO Number yang bisa diedit

---

## 4. Fitur Detail

### 4.1 Form Budget

**Header Form:**
- Division (dropdown)
- Project No (teks bebas, e.g. BUD-2026-001)
- Event Name
- Venue
- Periode (tanggal mulai & selesai)
- Management Fee % (default 10%)
- Notes

**Tabel Item:**
- Struktur hirarki: Main Item → Sub Items
- Kolom per sub-item: Description, QTY, MDY (Man-Day), Internal Rate, Budget Rate
- Kalkulasi otomatis: QTY × MDY × Rate = Total
- Drag & drop untuk reorder item dan sub-item

**Kalkulasi Ringkasan:**
| Baris | Formula |
|---|---|
| Subtotal Internal | Σ (QTY × MDY × Internal Rate) |
| Subtotal Budget | Σ (QTY × MDY × Budget Rate) |
| Management Fee | Subtotal Budget × Management Fee % |
| Total Budget | Subtotal Budget + Management Fee |
| PPN (11%) | Total Budget × 11% |
| Grand Total | Total Budget + PPN |
| After PPN | Total Budget (sebelum PPN) |
| After PPH (2%) | After PPN × 98% |
| P/L Budget | After PPH − Grand Total Internal |

### 4.2 Tab Realisasi
- Tampil hanya untuk form dengan status Approved dan realisasi aktif
- Data dari budget (Description, QTY, MDY, Rate) di-lock, tidak bisa diedit
- Kolom **Realisasi** bisa diisi oleh pemilik form
- Item baru bisa ditambahkan (fully editable)
- Kolom PO Number ditampilkan sebagai referensi (read-only)
- Kalkulasi tambahan: Grand Total Realisasi dan P/L Realisasi

### 4.3 Tab PO
- Tampil hanya untuk form yang sudah memiliki PO
- Main PO Number berlaku untuk seluruh form
- Per-row PO Number dapat diisi untuk setiap sub-item
- Hanya Admin, Manager, Corporate yang dapat mengedit

### 4.4 Dashboard
- Statistik ringkasan: Total form, per status (Draft, Pending, Approved, Revision)
- Daftar form terbaru
- Filter per status
- Daftar form milik saya
- Pending approvals untuk Admin/Corporate
- Aksi cepat: buka form, buat form baru

### 4.5 Version History
- Setiap form memiliki riwayat versi
- Setiap revisi membuat versi baru, versi lama di-archive
- Timeline persetujuan: siapa yang approve/reject, kapan, dengan catatan apa

### 4.6 Export Excel
- Export seluruh data budget ke format `.xlsx`
- Formula Excel dipertahankan (tidak hard-coded)
- Kolom Realisasi ikut ter-export jika sedang di tab Realisasi
- Nama file: `PVBudget_v{versi}.xlsx`

### 4.7 Template
- Form yang sudah ada dapat digunakan sebagai template untuk form baru
- Data event (nama, venue, tanggal) di-reset, items disalin

---

## 5. Manajemen User & Divisi

### 5.1 User
- Admin dapat membuat, mengedit, menghapus user
- Role yang tersedia: Admin, Corporate, Manager, User
- Setiap user dapat ditetapkan ke satu divisi
- Manager dapat ditetapkan untuk mengelola beberapa divisi
- Manager memiliki atasan (manager_id) opsional

### 5.2 Divisi
- Admin dapat membuat, mengedit, menghapus divisi
- Divisi yang masih digunakan oleh user tidak dapat dihapus
- Form dapat dikaitkan dengan divisi

---

## 6. Keamanan

- Autentikasi berbasis session token (24 jam)
- Rate limiting pada endpoint login (15 menit block setelah terlalu banyak gagal)
- Visibilitas form berbasis role: user hanya melihat form sendiri + form approved
- Setiap mutasi form memvalidasi kepemilikan atau role
- Endpoint realisasi, PO, dan persetujuan memiliki pemeriksaan ownership terpisah
- 2-stage approval mencegah satu orang menyetujui sendiri dua kali

---

## 7. Arsitektur Teknis

### 7.1 Stack
| Layer | Teknologi |
|---|---|
| Frontend | React 19, Vite 7 |
| UI | Custom CSS (no framework), Lucide icons |
| Drag & Drop | @dnd-kit |
| Backend | Node.js, Express 5 |
| Database | SQLite (via sqlite3) |
| Auth | Session token (bcrypt password hashing) |
| Export | SheetJS (xlsx) |

### 7.2 Database Schema

**Tabel Utama:**
- `users` — id, username, password, display_name, role, division_id, manager_id
- `divisions` — id, name, description
- `forms` — id, form_type, project_no, event, venue, periode, data (JSON), status, version_number, root_form_id, management_fee_pct, realiza_data (JSON), has_realisasi, has_po, po_number, created_by, division_id
- `sessions` — token, user_id, created_at
- `manager_divisions` — manager_id, division_id (many-to-many)
- `approval_history` — form_id, action, note, actor_id, approval_stage

### 7.3 Status Form
| Status | Deskripsi |
|---|---|
| `draft` | Form baru, bisa diedit oleh pemilik |
| `pending` | Sudah disubmit, menunggu persetujuan |
| `revision` | Dikembalikan untuk direvisi |
| `approved` | Sudah disetujui 2 tahap, terkunci |
| `archived` | Versi lama yang digantikan versi baru |

---

## 8. API Endpoints

### Auth
| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Info user saat ini |

### Forms
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/forms` | List form (dengan filter & pagination) |
| GET | `/api/forms/my` | Form milik user saat ini |
| GET | `/api/forms/pending` | Form menunggu approval |
| GET | `/api/forms/:id` | Detail form |
| POST | `/api/forms` | Buat form baru |
| PUT | `/api/forms/:id` | Update form |
| DELETE | `/api/forms/:id` | Hapus form (Admin) |
| POST | `/api/forms/:id/submit` | Submit untuk approval |
| POST | `/api/forms/:id/approve` | Approve form |
| POST | `/api/forms/:id/reject` | Tolak/minta revisi |
| PUT | `/api/forms/:id/unlock` | Unlock form approved |
| PUT | `/api/forms/:id/po` | Update PO Number |
| POST | `/api/forms/:id/create-po` | Inisiasi PO |
| POST | `/api/forms/:id/enable-realisasi` | Aktifkan tab realisasi |
| GET | `/api/forms/:id/history` | Riwayat versi |
| GET | `/api/forms/:id/approval-history` | Log persetujuan |

### Users & Divisions
| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/api/users` | List user |
| POST | `/api/users` | Buat user |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Hapus user |
| PUT | `/api/users/:id/managed-divisions` | Set divisi yang dikelola manager |
| GET | `/api/divisions` | List divisi |
| POST | `/api/divisions` | Buat divisi |
| PUT | `/api/divisions/:id` | Update divisi |
| DELETE | `/api/divisions/:id` | Hapus divisi |

---

## 9. Batasan & Ketentuan

- Form yang sudah Approved tidak dapat diedit kecuali oleh Admin (Unlock for Revision)
- Realisasi hanya bisa diisi oleh pemilik form, Admin tidak terbatas
- Satu form hanya bisa memiliki satu realisasi aktif
- Dua approver harus berbeda; satu orang tidak bisa approve kedua tahap
- Divisi yang masih dipakai user tidak bisa dihapus
- PO hanya bisa dibuat dari form dengan status Approved dan tipe budget
- Versi lama di-archive secara otomatis saat versi baru approved

---

## 10. Lingkungan & Konfigurasi

```env
# .env.development
VITE_API_URL=http://localhost:3001
PORT=3001

# Opsional
DEFAULT_ADMIN_PASSWORD=admin123
DEFAULT_CORPORATE_PASSWORD=corp123
DEFAULT_MANAGER_PASSWORD=manager123
DEFAULT_USER_PASSWORD=user123
```

### Menjalankan Aplikasi
```bash
# Backend (port 3001)
node server/index.cjs

# Frontend (port 5173)
npm run dev

# Build production
npm run build
```
