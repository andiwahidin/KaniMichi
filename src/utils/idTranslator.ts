import { useEffect, useState } from 'react';
import type { CurriculumItem } from '../types/curriculum';

const CACHE_KEY = 'leksika_id_translations_v1';

/**
 * Kamus luring Bahasa Indonesia untuk kosakata, radikal, kanji inti JLPT N5–N4,
 * dan label kelas kata agar terjemahan langsung tampil dalam Bahasa Indonesia tanpa jeda.
 */
const OFFLINE_ID_DICT: Record<string, string> = {
  // Part of speech
  'noun': 'Kata Benda',
  'verb': 'Kata Kerja',
  'transitive verb': 'Kata Kerja Transitif',
  'intransitive verb': 'Kata Kerja Intransitif',
  'ichidan verb': 'Kata Kerja Golongan II (Ichidan)',
  'godan verb': 'Kata Kerja Golongan I (Godan)',
  'suru verb': 'Kata Kerja Suru',
  'i-adjective': 'Kata Sifat-i',
  'na-adjective': 'Kata Sifat-na',
  'adjective': 'Kata Sifat',
  'adverb': 'Kata Keterangan',
  'counter': 'Kata Satuan',
  'prefix': 'Awalan',
  'suffix': 'Akhiran',
  'pronoun': 'Kata Ganti',
  'expression': 'Ungkapan',
  'numeral': 'Kata Bilangan',
  'conjunction': 'Kata Sambung',
  'particle': 'Partikel',
  'interjection': 'Kata Seru',
  'proper noun': 'Kata Benda Khusus',
  'noun, suru verb': 'Kata Benda, Kata Kerja Suru',
  'noun, na-adjective': 'Kata Benda, Kata Sifat-na',

  // Level 1–3 Radicals, Kanji & Vocabulary (100% coverage)
  'big': 'Besar',
  'construction': 'Konstruksi',
  'cross': 'Silang',
  'enter': 'Masuk',
  'fins': 'Sirip',
  'ground': 'Tanah',
  'mountain': 'Gunung',
  'mouth': 'Mulut',
  'nine': 'Sembilan',
  'person': 'Orang',
  'power': 'Kekuatan',
  'river': 'Sungai',
  'seven': 'Tujuh',
  'toe': 'Jari Kaki',
  'two': 'Dua',
  'woman': 'Wanita',
  'barb': 'Kait',
  'book': 'Buku',
  'child': 'Anak',
  'dirt': 'Tanah / Debu',
  'dog': 'Anjing',
  'drop': 'Tetes',
  'evening': 'Petang / Sore',
  'eye': 'Mata',
  'fire': 'Api',
  'five': 'Lima',
  'hand': 'Tangan',
  'head': 'Kepala',
  'heaven': 'Langit / Surga',
  'king': 'Raja',
  'legs': 'Kaki',
  'lid': 'Tutup',
  'middle': 'Tengah',
  'moon': 'Bulan',
  'narwhal': 'Paus Bertanduk',
  'rice paddy': 'Sawah',
  'slide': 'Seluncuran',
  'small': 'Kecil',
  'stand': 'Berdiri',
  'stool': 'Bangku',
  'stop': 'Berhenti',
  'street': 'Jalan',
  'sun': 'Matahari',
  'sword': 'Pedang',
  'thousand': 'Seribu',
  'tree': 'Pohon',
  'water': 'Air',
  'white': 'Putih',
  'writing': 'Tulisan',
  'arrow': 'Panah',
  'bow': 'Busur',
  'canopy': 'Kanopi / Atap',
  'cow': 'Sapi',
  'direction': 'Arah',
  'door': 'Pintu',
  'dry': 'Kering',
  'father': 'Ayah',
  'fingers': 'Jari-jari',
  'fur': 'Bulu',
  'heart': 'Hati',
  'leaf': 'Daun',
  'life': 'Kehidupan / Hidup',
  'now': 'Sekarang',
  'old': 'Lama / Tua',
  'origin': 'Asal',
  'private': 'Pribadi',
  'spoon': 'Sendok',
  'stick': 'Tongkat',
  'task': 'Tugas',
  'towel': 'Handuk',
  'triceratops': 'Tanduk Tiga',
  'winter': 'Musim Dingin',
  'one': 'Satu',
  'ten': 'Sepuluh',
  'three': 'Tiga',
  'above': 'Atas',
  'eight': 'Delapan',
  'below': 'Bawah',
  'exit': 'Keluar',
  'four': 'Empat',
  'yen': 'Yen',
  'six': 'Enam',
  'correct': 'Benar',
  'circle': 'Lingkaran',
  'right': 'Kanan',
  'left': 'Kiri',
  'ball': 'Bola',
  'finish': 'Selesai',
  'genius': 'Jenius',
  'again': 'Lagi',
  'part': 'Bagian',
  'city': 'Kota',
  'inside': 'Di Dalam',
  'outside': 'Di Luar',
  'public': 'Umum / Publik',
  'north': 'Utara',
  'noon': 'Siang',
  'pull': 'Tarik',
  'half': 'Setengah',
  'machine': 'Mesin',
  'wide': 'Luas / Lebar',
  'few': 'Sedikit',
  'cut': 'Potong',
  'ten thousand': 'Sepuluh Ribu',
  'fat': 'Gemuk / Tebal',
  'mother': 'Ibu',
  'friend': 'Teman',
  'force': 'Tenaga / Gaya',
  'large': 'Besar',
  'mouthful': 'Sesuap',
  'to make a decision': 'Mengambil Keputusan',
  'down-train': 'Kereta Menuju Luar Kota',
  'to descend': 'Turun',
  'speech': 'Pidato / Ucapan',
  'eleven': 'Sebelas',
  'thirteen': 'Tiga Belas',
  'twelve': 'Dua Belas',
  'tuck': 'Lipatan',
  'ascent': 'Pendakian / Kenaikan',
  'to ascend': 'Naik / Mendaki',
  'top and bottom': 'Atas dan Bawah',
  'population': 'Populasi / Penduduk',
  'entering': 'Memasuki',
  'to enter': 'Masuk',
  'to strain': 'Memeras / Memaksakan',
  'one person': 'Satu Orang',
  'people': 'Orang-orang',
  'one-by-one': 'Satu per Satu',
  'every person': 'Setiap Orang',
  'mountains': 'Pegunungan',
  'one daughter': 'Satu Putri',
  'big mouth': 'Mulut Besar / Pembual',
  'one or two': 'Satu atau Dua',
  'true': 'Benar / Sejati',
  'sky': 'Langit',
  'earth': 'Bumi',
  'day': 'Hari',
  'sentence': 'Kalimat',
  'coming out': 'Keluar',
  'ability': 'Kemampuan',
  'rice field': 'Sawah',
  'one yen': 'Satu Yen',
  'january': 'Januari',
  'one move': 'Satu Langkah',
  'one leaf': 'Satu Lembar Daun',
  'tiny amount of money': 'Uang Receh / Jumlah Kecil',
  'one long cylindrical thing': 'Satu Benda Panjang',
  'glance': 'Sekilas Pandang',
  'right hand': 'Tangan Kanan',
  'prince': 'Pangeran',
  'dying down': 'Mereda',
  'unskillful': 'Kurang Mahir',
  'drainage': 'Saluran Air / Drainase',
  'heating power': 'Daya Panas / Tenaga Api',
  'roundness': 'Kebulatan',
  'september': 'September',
  '9th day of the month': 'Tanggal 9',
  'time': 'Waktu',
  'may': 'Mei',
  '5th day of the month': 'Tanggal 5',
  'fuse': 'Sekering / Sumbu',
  'left and right': 'Kiri dan Kanan',
  'left hand': 'Tangan Kiri',
  'march': 'Maret',
  '3rd day of the month': 'Tanggal 3',
  'april': 'April',
  '4th day of the month': 'Tanggal 4',
  'sons and daughters': 'Putra dan Putri',
  'july': 'Juli',
  'model': 'Model / Contoh',
  'to take out': 'Mengeluarkan',
  'to leave': 'Meninggalkan / Keluar',
  'dashi': 'Kaldu Dashi',
  'queen': 'Ratu',
  'maidservant': 'Pelayan Wanita',
  'knife': 'Pisau',
  'skillful': 'Mahir / Terampil',
  'drop of water': 'Setetes Air',
  'on the water': 'Di Atas Air',
  'cattle': 'Ternak Sapi',
  'the horse': 'Kuda',
  'official': 'Resmi / Pejabat',
  'mind': 'Pikiran',
  'raw': 'Mentah',
  'minute': 'Menit',
  'hair': 'Rambut',
  'business': 'Bisnis / Urusan',
  '10,000': '10.000',
  'antiquity': 'Zaman Kuno',
  'market': 'Pasar',
  'single element': 'Satu Unsur',
  'one mind': 'Sepenuh Hati',
  'all': 'Semua',
  'to pull': 'Menarik',
  'attraction': 'Daya Tarik',
  'right side': 'Sisi Kanan',
  'to remove': 'Menghapus / Melepas',
  'end': 'Akhir',
  'foreigner': 'Orang Asing',
  'log': 'Batang Kayu',
  'principal': 'Kepala Sekolah / Utama',
  'official business': 'Urusan Dinas',
  'area': 'Wilayah / Area',
  'the four cardinal directions': 'Empat Penjuru Mata Angin',
  'in the city': 'Di Dalam Kota',
  'at hand': 'Di Dekat Tangan',
  'enough': 'Cukup',
  'attitude': 'Sikap',
  'a little': 'Sedikit',
  'regrettable': 'Disayangkan',
  'double suicide': 'Bunuh Diri Ganda',
  'water buffalo': 'Kerbau',
  'living': 'Hidup',
  'to cut': 'Memotong',
  'piece': 'Potongan',
  'stamp': 'Prangko',
  'long sword': 'Pedang Panjang',
  'important': 'Penting',
  'majority': 'Mayoritas',
  'large part': 'Sebagian Besar',
  '15th day of the 7th lunar month': 'Festival Obon (Pertengahan Bulan 7)',
  'used': 'Bekas / Terpakai',
  'interruption': 'Gangguan / Jeda',
  'center': 'Pusat / Tengah',
  'foundation': 'Fondasi / Dasar',
  'inner thoughts': 'Isi Hati',
  'halving': 'Membagi Dua',
  'all sides': 'Segala Arah',
  "father's side of family": 'Keluarga Pihak Ayah',
  'division': 'Pembagian / Divisi',
  'molecule': 'Molekul',
  "mother's side of family": 'Keluarga Pihak Ibu',
  'the north': 'Utara',
  'true feelings': 'Perasaan Sebenarnya',
  'emergency': 'Darurat',
  'wicket gate': 'Gerbang Tiket',
  'whole life': 'Seumur Hidup',
  'ancient writing': 'Naskah Kuno',
  'secondhand book': 'Buku Bekas',
  'today': 'Hari Ini',
  'three sides': 'Tiga Sisi',
  'girl': 'Anak Perempuan / Gadis',
  'human nature': 'Sifat Manusia',
  'inside and outside': 'Dalam dan Luar',
  'half-moon': 'Bulan Sabit / Setengah Bulan',
  'to give birth': 'Melahirkan',
  'calf': 'Anak Sapi',
  'originally': 'Awalnya / Semula',
  'mark': 'Tanda',
  'crown prince': 'Putra Mahkota',
  'birth': 'Kelahiran',

  // Common JLPT N5–N4 core meanings
  'adult': 'Orang Dewasa',
  'japan': 'Jepang',
  'volcano': 'Gunung Berapi',
  'up': 'Atas',
  'down': 'Bawah',
  'ear': 'Telinga',
  'foot': 'Kaki',
  'leg': 'Kaki',
  'stone': 'Batu',
  'gold': 'Emas',
  'money': 'Uang',
  'soil': 'Tanah',
  'jewel': 'Permata',
  'rain': 'Hujan',
  'hundred': 'Seratus',
  'student': 'Siswa / Pelajar',
  'school': 'Sekolah',
  'ahead': 'Depan',
  'previous': 'Sebelumnya',
  'teacher': 'Guru',
  'name': 'Nama',
  'year': 'Tahun',
  'early': 'Awal / Cepat',
  'divide': 'Membagi',
  'south': 'Selatan',
  'east': 'Timur',
  'west': 'Barat',
  'many': 'Banyak',
  'older brother': 'Kakak Laki-laki',
  'older sister': 'Kakak Perempuan',
  'younger brother': 'Adik Laki-laki',
  'younger sister': 'Adik Perempuan',
  'house': 'Rumah',
  'home': 'Rumah',
  'room': 'Kamar / Ruangan',
  'shop': 'Toko',
  'store': 'Toko',
  'car': 'Mobil',
  'vehicle': 'Kendaraan',
  'electric': 'Listrik',
  'electricity': 'Listrik',
  'train': 'Kereta',
  'station': 'Stasiun',
  'road': 'Jalan',
  'way': 'Jalan / Cara',
  'eat': 'Makan',
  'to eat': 'Makan',
  'drink': 'Minum',
  'to drink': 'Minum',
  'see': 'Melihat',
  'to see': 'Melihat',
  'look': 'Melihat',
  'hear': 'Mendengar',
  'listen': 'Mendengar',
  'speak': 'Berbicara',
  'to speak': 'Berbicara',
  'say': 'Mengatakan',
  'to say': 'Mengatakan',
  'word': 'Kata',
  'language': 'Bahasa',
  'read': 'Membaca',
  'to read': 'Membaca',
  'write': 'Menulis',
  'to write': 'Menulis',
  'buy': 'Membeli',
  'to buy': 'Membeli',
  'sell': 'Menjual',
  'to sell': 'Menjual',
  'go': 'Pergi',
  'to go': 'Pergi',
  'come': 'Datang',
  'to come': 'Datang',
  'return': 'Pulang / Kembali',
  'meet': 'Bertemu',
  'to meet': 'Bertemu',
  'rest': 'Istirahat',
  'work': 'Bekerja',
  'make': 'Membuat',
  'use': 'Menggunakan',
  'think': 'Berpikir',
  'know': 'Mengetahui',
  'understand': 'Memahami',
  'like': 'Suka',
  'love': 'Cinta',
  'new': 'Baru',
  'long': 'Panjang',
  'short': 'Pendek',
  'high': 'Tinggi',
  'tall': 'Tinggi',
  'expensive': 'Mahal',
  'cheap': 'Murah',
  'low': 'Rendah',
  'narrow': 'Sempit',
  'near': 'Dekat',
  'far': 'Jauh',
  'fast': 'Cepat',
  'slow': 'Lambat',
  'hot': 'Panas',
  'cold': 'Dingin',
  'warm': 'Hangat',
  'cool': 'Sejuk',
  'bright': 'Terang',
  'dark': 'Gelap',
  'heavy': 'Berat',
  'light': 'Ringan / Cahaya',
  'strong': 'Kuat',
  'weak': 'Lemah',
  'good': 'Baik',
  'bad': 'Buruk',
  'same': 'Sama',
  'different': 'Berbeda',
  'red': 'Merah',
  'blue': 'Biru',
  'green': 'Hijau',
  'yellow': 'Kuning',
  'black': 'Hitam',
  'spring': 'Musim Semi',
  'summer': 'Musim Panas',
  'autumn': 'Musim Gugur',
  'fall': 'Musim Gugur',
  'morning': 'Pagi',
  'night': 'Malam',
  'tomorrow': 'Besok',
  'yesterday': 'Kemarin',
  'every day': 'Setiap Hari',
  'week': 'Minggu',
  'month': 'Bulan',
  'flower': 'Bunga',
  'grass': 'Rumput',
  'forest': 'Hutan',
  'woods': 'Hutan',
  'sea': 'Laut',
  'ocean': 'Samudra',
  'wind': 'Angin',
  'cloud': 'Awan',
  'snow': 'Salju',
  'fish': 'Ikan',
  'bird': 'Burung',
  'cat': 'Kucing',
  'horse': 'Kuda',
  'meat': 'Daging',
  'tea': 'Teh',
  'rice': 'Nasi / Beras',
  'spirit': 'Semangat / Jiwa',
  'body': 'Tubuh',
  'face': 'Wajah',
  'voice': 'Suara',
  'sound': 'Bunyi / Suara',
  'music': 'Musik',
  'song': 'Lagu',
  'color': 'Warna',
  'picture': 'Gambar',
  'letter': 'Surat / Huruf',
  'paper': 'Kertas',
  'bookstore': 'Toko Buku',
  'library': 'Perpustakaan',
  'hospital': 'Rumah Sakit',
  'bank': 'Bank',
  'company': 'Perusahaan',
  'country': 'Negara',
  'world': 'Dunia',
  'town': 'Kota',
  'village': 'Desa',
  'field': 'Ladang',
  'bridge': 'Jembatan',
  'temple': 'Kuil',
  'shrine': 'Kuil Shinto',
  'february': 'Februari',
  'june': 'Juni',
  'august': 'Agustus',
  'october': 'Oktober',
  'november': 'November',
  'december': 'Desember',
  'sunday': 'Minggu',
  'monday': 'Senin',
  'tuesday': 'Selasa',
  'wednesday': 'Rabu',
  'thursday': 'Kamis',
  'friday': 'Jumat',
  'saturday': 'Sabtu',
  'man': 'Pria',
  'male': 'Laki-laki',
  'female': 'Perempuan',
  'boy': 'Anak Laki-laki',
  'family': 'Keluarga',
  'parent': 'Orang Tua',
  'parents': 'Orang Tua',
  'doctor': 'Dokter',
  'police': 'Polisi',
  'god': 'Tuhan / Dewa',
  'study': 'Belajar',
  'to study': 'Belajar',
  'learn': 'Belajar',
  'teach': 'Mengajar',
  'question': 'Pertanyaan',
  'answer': 'Jawaban',
  'test': 'Ujian / Tes',
  'exam': 'Ujian',
  'class': 'Kelas',
  'university': 'Universitas',
  'college': 'Perguruan Tinggi',
  'weather': 'Cuaca',
  'air': 'Udara',
  'star': 'Bintang',
  'sunlight': 'Sinar Matahari',
  'map': 'Peta',
  'travel': 'Perjalanan / Wisata',
  'trip': 'Perjalanan',
  'hotel': 'Hotel',
  'airport': 'Bandara',
  'ticket': 'Tiket',
  'seat': 'Tempat Duduk',
  'window': 'Jendela',
  'table': 'Meja',
  'chair': 'Kursi',
  'bed': 'Tempat Tidur',
  'kitchen': 'Dapur',
  'bath': 'Bak Mandi',
  'toilet': 'Toilet',
  'clothes': 'Pakaian',
  'shoes': 'Sepatu',
  'hat': 'Topi',
  'glasses': 'Kacamata',
  'bag': 'Tas',
  'umbrella': 'Payung',
  'watch': 'Jam Tangan',
  'clock': 'Jam',
  'phone': 'Telepon',
  'telephone': 'Telepon',
  'computer': 'Komputer',
  'camera': 'Kamera',
  'television': 'Televisi',
  'radio': 'Radio',
  'newspaper': 'Koran / Surat Kabar',
  'magazine': 'Majalah',
  'movie': 'Film',
  'photo': 'Foto',
  'photograph': 'Foto',
  'medicine': 'Obat',
  'sick': 'Sakit',
  'illness': 'Penyakit',
  'health': 'Kesehatan',
  'healthy': 'Sehat',
  'happy': 'Bahagia / Senang',
  'sad': 'Sedih',
  'angry': 'Marah',
  'tired': 'Lelah',
  'busy': 'Sibuk',
  'free': 'Gratis / Bebas',
  'easy': 'Mudah',
  'difficult': 'Sulit',
  'hard': 'Sulit / Keras',
  'quiet': 'Tenang / Sepi',
  'noisy': 'Berisik',
  'clean': 'Bersih',
  'dirty': 'Kotor',
  'beautiful': 'Indah / Cantik',
  'cute': 'Lucu / Imut',
  'famous': 'Terkenal',
  'kind': 'Ramah / Baik Hati',
  'convenient': 'Praktis / Nyaman',
  'dangerous': 'Berbahaya',
  'safe': 'Aman',
  'necessary': 'Diperlukan / Penting',
  'special': 'Khusus / Istimewa',
  'normal': 'Biasa / Normal',
  'interesting': 'Menarik',
  'boring': 'Membosankan',
  'delicious': 'Lezat / Enak',
  'sweet': 'Manis',
  'spicy': 'Pedas',
  'salty': 'Asin',
  'sour': 'Asam',
  'bitter': 'Pahit',
  'breakfast': 'Sarapan',
  'lunch': 'Makan Siang',
  'dinner': 'Makan Malam',
  'food': 'Makanan',
  'meal': 'Makanan / Hidangan',
  'bread': 'Roti',
  'egg': 'Telur',
  'milk': 'Susu',
  'coffee': 'Kopi',
  'vegetable': 'Sayuran',
  'fruit': 'Buah',
  'apple': 'Apel',
  'salt': 'Garam',
  'sugar': 'Gula',
  'oil': 'Minyak',
};

const runtimeCache = new Map<string, string>();
const inFlight = new Set<string>();
const failedTexts = new Set<string>();
const listeners = new Set<() => void>();
let cacheVersion = 0;

function loadLocalCache() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim()) {
          runtimeCache.set(k, v.trim());
        }
      }
    }
  } catch {
    // Ignore storage read errors
  }
}

let saveTimer: number | null = null;
function scheduleSaveLocalCache() {
  if (typeof window === 'undefined') return;
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    try {
      const obj: Record<string, string> = {};
      const entries = Array.from(runtimeCache.entries());
      // Keep the most recent 6,000 cached translations within localStorage budget
      const sliced = entries.length > 6000 ? entries.slice(-6000) : entries;
      for (const [k, v] of sliced) {
        obj[k] = v;
      }
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
    } catch {
      // Ignore quota errors
    }
  }, 500);
}

loadLocalCache();

function notifyListeners() {
  cacheVersion += 1;
  for (const fn of listeners) {
    fn();
  }
}

export function translateSync(text?: string | null): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed) return '';

  const exact = runtimeCache.get(trimmed);
  if (exact) return exact;

  const lower = trimmed.toLowerCase();
  const offline = OFFLINE_ID_DICT[lower];
  if (offline) return offline;

  // Handle semicolon-separated short glosses if all parts exist in offline dict
  if (trimmed.includes(';') && trimmed.length < 120) {
    const parts = trimmed.split(';').map((p) => p.trim()).filter(Boolean);
    const translatedParts = parts.map((p) => runtimeCache.get(p) ?? OFFLINE_ID_DICT[p.toLowerCase()]);
    if (translatedParts.every(Boolean)) {
      return translatedParts.join('; ');
    }
  }

  return trimmed;
}

export function hasIndonesianTranslation(text?: string | null): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (runtimeCache.has(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  if (OFFLINE_ID_DICT[lower]) return true;
  // Skip pure numbers or pure Japanese/Arabic/punctuation
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return true;
  return false;
}

export function translatePartOfSpeech(pos?: string | null): string {
  if (!pos) return '';
  const trimmed = pos.trim();
  const direct = OFFLINE_ID_DICT[trimmed.toLowerCase()];
  if (direct) return direct;
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((part) => {
        const clean = part.trim();
        return OFFLINE_ID_DICT[clean.toLowerCase()] ?? clean;
      })
      .join(', ');
  }
  return trimmed;
}

export interface TranslationEntry {
  text: string;
  hint?: string;
}

let pendingQueue: TranslationEntry[] = [];
let flushTimer: number | null = null;
let activeBatchCount = 0;

async function processQueue() {
  if (activeBatchCount >= 2 || pendingQueue.length === 0) return;

  const batch: TranslationEntry[] = [];
  const seen = new Set<string>();
  while (pendingQueue.length > 0 && batch.length < 36) {
    const next = pendingQueue.shift()!;
    const clean = next.text.trim();
    if (!clean || hasIndonesianTranslation(clean) || inFlight.has(clean) || failedTexts.has(clean) || seen.has(clean)) {
      continue;
    }
    seen.add(clean);
    inFlight.add(clean);
    batch.push({ text: clean, hint: next.hint });
  }

  if (batch.length === 0) return;

  activeBatchCount += 1;
  try {
    const res = await fetch('/api/ai/translate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: batch }),
    });
    if (!res.ok) {
      for (const item of batch) failedTexts.add(item.text);
      return;
    }
    const data = (await res.json()) as { translations?: Record<string, string> };
    const map = data.translations ?? {};
    let updated = false;
    for (const item of batch) {
      const idText = map[item.text];
      if (typeof idText === 'string' && idText.trim()) {
        runtimeCache.set(item.text, idText.trim());
        updated = true;
      } else {
        failedTexts.add(item.text);
      }
    }
    if (updated) {
      scheduleSaveLocalCache();
      notifyListeners();
    }
  } catch {
    for (const item of batch) failedTexts.add(item.text);
  } finally {
    for (const item of batch) inFlight.delete(item.text);
    activeBatchCount -= 1;
    if (pendingQueue.length > 0) {
      void processQueue();
    }
  }
}

export function queueTranslations(entries: TranslationEntry[]) {
  let added = false;
  for (const entry of entries) {
    const clean = entry?.text?.trim();
    if (!clean) continue;
    if (hasIndonesianTranslation(clean) || inFlight.has(clean) || failedTexts.has(clean)) {
      continue;
    }
    pendingQueue.push({ text: clean, hint: entry.hint });
    added = true;
  }

  if (added && flushTimer === null && typeof window !== 'undefined') {
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      void processQueue();
    }, 60);
  }
}

/**
 * Subscribe to runtime Indonesian translation updates.
 */
export function useTranslationVersion(): number {
  const [ver, setVer] = useState(cacheVersion);
  useEffect(() => {
    const cb = () => setVer(cacheVersion);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return ver;
}

/**
 * Hook untuk menerjemahkan daftar teks Inggris ke Bahasa Indonesia secara otomatis
 * (cek kamus offline & cache lokal dulu, sisanya langsung diterjemahkan batch lewat AI).
 */
export function useAutoIndonesian(entries: TranslationEntry[]): {
  t: (text?: string | null) => string;
  version: number;
} {
  const version = useTranslationVersion();
  const signature = entries
    .map((e) => e.text?.trim() || '')
    .filter(Boolean)
    .slice(0, 80)
    .join('\u0001');

  useEffect(() => {
    if (!signature) return;
    queueTranslations(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return {
    t: translateSync,
    version,
  };
}

/**
 * Dapatkan daftar acceptedMeanings lengkap (Bahasa Indonesia utama + sinonim + Inggris asli)
 * agar kuis SRS menerima jawaban Bahasa Indonesia secara penuh.
 */
export function buildIndonesianAcceptedMeanings(
  originalPrimary: string,
  originalAccepted: string[],
  translatedPrimary?: string
): string[] {
  const idMain = (translatedPrimary || translateSync(originalPrimary)).trim();
  const pool = new Set<string>();
  const pushParts = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    pool.add(clean.toLowerCase());
    for (const part of clean.split(/[/;,]/)) {
      const p = part.trim().toLowerCase();
      if (p.length >= 2) pool.add(p);
    }
  };

  pushParts(idMain);
  pushParts(originalPrimary);
  for (const m of originalAccepted) {
    pushParts(m);
    const trans = translateSync(m);
    if (trans !== m) pushParts(trans);
  }
  return Array.from(pool);
}

/**
 * Hook khusus untuk menerjemahkan daftar CurriculumItem (Radikal, Kanji, Kosakata)
 * secara otomatis & menyelaraskan primaryMeaning serta acceptedMeanings Bahasa Indonesia.
 */
export function useAutoTranslateCurriculumItems(items: (CurriculumItem | null | undefined)[]): number {
  const version = useTranslationVersion();

  const keys = items
    .filter((it): it is CurriculumItem => Boolean(it))
    .slice(0, 60)
    .map((it) => `${it.id}:${it.primaryMeaning}`)
    .join('|');

  useEffect(() => {
    const entries: TranslationEntry[] = [];
    for (const it of items) {
      if (!it) continue;
      if (!hasIndonesianTranslation(it.primaryMeaning)) {
        entries.push({
          text: it.primaryMeaning,
          hint: `${it.type} ${it.characters}`,
        });
      }
      if (it.contextSentences) {
        for (const s of it.contextSentences) {
          if (s.en && !hasIndonesianTranslation(s.en)) {
            entries.push({ text: s.en, hint: `contoh kalimat ${it.characters}` });
          }
        }
      }
    }
    if (entries.length > 0) {
      queueTranslations(entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  // Synchronously resolve cached/offline Indonesian meanings onto items if newly translated
  for (const it of items) {
    if (!it) continue;
    const translated = translateSync(it.primaryMeaning);
    if (translated && translated !== it.primaryMeaning) {
      const oldPrimary = it.primaryMeaning;
      it.primaryMeaning = translated;
      it.acceptedMeanings = buildIndonesianAcceptedMeanings(
        oldPrimary,
        it.acceptedMeanings,
        translated
      );
      if (it.meaningMnemonic.includes(`"${oldPrimary}"`)) {
        it.meaningMnemonic = it.meaningMnemonic.replaceAll(`"${oldPrimary}"`, `"${translated}"`);
      }
      if (it.readingMnemonic && it.readingMnemonic.includes(`"${oldPrimary}"`)) {
        it.readingMnemonic = it.readingMnemonic.replaceAll(`"${oldPrimary}"`, `"${translated}"`);
      }
    }
  }

  return version;
}
