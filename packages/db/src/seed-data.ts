export interface SeedDestination {
  id: string;
  slug: string;
  scope: "thailand" | "worldwide";
  countryCode: string;
  provinceCode: string | null;
  cityCode: string | null;
  latitude: number;
  longitude: number;
  address: string;
  categorySlugs: string[];
  travelerTypes: string[];
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  rating: number;
  likesCount: number;
  featured: boolean;
  trending: boolean;
  popular: boolean;
  seasonal: boolean;
  bestMonths: number[];
  transportModes: Array<"car" | "rail" | "transit" | "airplane">;
  en: { name: string; shortDescription: string; description: string };
  th: { name: string; shortDescription: string; description: string };
}

export const seedCategories = [
  { id: "10000000-0000-4000-8000-000000000001", slug: "beaches", icon: "Waves", en: "Beaches", th: "ชายหาด" },
  { id: "10000000-0000-4000-8000-000000000002", slug: "culture", icon: "Landmark", en: "Culture", th: "วัฒนธรรม" },
  { id: "10000000-0000-4000-8000-000000000003", slug: "nature", icon: "Trees", en: "Nature", th: "ธรรมชาติ" },
  { id: "10000000-0000-4000-8000-000000000004", slug: "food", icon: "Utensils", en: "Food", th: "อาหาร" },
  { id: "10000000-0000-4000-8000-000000000005", slug: "adventure", icon: "Mountain", en: "Adventure", th: "ผจญภัย" },
  { id: "10000000-0000-4000-8000-000000000006", slug: "city", icon: "Building2", en: "City breaks", th: "เที่ยวเมือง" },
] as const;

export const seedDestinations: SeedDestination[] = [
  {
    id: "20000000-0000-4000-8000-000000000001", slug: "doi-inthanon", scope: "thailand", countryCode: "TH", provinceCode: "CHIANG-MAI", cityCode: "CHOM-THONG", latitude: 18.5888, longitude: 98.4867, address: "Ban Luang, Chom Thong, Chiang Mai", categorySlugs: ["nature", "adventure"], travelerTypes: ["nature-lover", "couple", "family"], imageUrl: "https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1067, rating: 4.8, likesCount: 2841, featured: true, trending: true, popular: true, seasonal: true, bestMonths: [11, 12, 1, 2], transportModes: ["car"],
    en: { name: "Doi Inthanon", shortDescription: "Misty trails, waterfalls, and Thailand's highest summit.", description: "Walk cloud-forest trails, visit twin pagodas, and watch the northern landscape unfold from Thailand's highest mountain." },
    th: { name: "ดอยอินทนนท์", shortDescription: "เส้นทางหมอก น้ำตก และยอดเขาที่สูงที่สุดในประเทศไทย", description: "เดินป่าในเมฆ ชมพระมหาธาตุคู่ และมองวิวภาคเหนือจากยอดเขาที่สูงที่สุดของประเทศไทย" },
  },
  {
    id: "20000000-0000-4000-8000-000000000002", slug: "railay-beach", scope: "thailand", countryCode: "TH", provinceCode: "KRABI", cityCode: "AO-NANG", latitude: 8.0117, longitude: 98.837, address: "Ao Nang, Mueang Krabi, Krabi", categorySlugs: ["beaches", "adventure"], travelerTypes: ["couple", "adventurer", "solo"], imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1067, rating: 4.7, likesCount: 5198, featured: true, trending: false, popular: true, seasonal: true, bestMonths: [11, 12, 1, 2, 3, 4], transportModes: ["car", "airplane"],
    en: { name: "Railay Beach", shortDescription: "Limestone cliffs and clear Andaman water, reached only by boat.", description: "Kayak between limestone walls, climb renowned routes, and settle into a quiet beach evening after the day boats leave." },
    th: { name: "หาดไร่เลย์", shortDescription: "หน้าผาหินปูนและน้ำใสอันดามัน เดินทางถึงได้ด้วยเรือเท่านั้น", description: "พายเรือคายัคระหว่างหน้าผาหินปูน ปีนผา และพักผ่อนบนชายหาดอันเงียบสงบในยามเย็น" },
  },
  {
    id: "20000000-0000-4000-8000-000000000003", slug: "ayutthaya-historical-park", scope: "thailand", countryCode: "TH", provinceCode: "AYUTTHAYA", cityCode: "AYUTTHAYA", latitude: 14.3559, longitude: 100.5683, address: "Phra Nakhon Si Ayutthaya", categorySlugs: ["culture"], travelerTypes: ["culture-seeker", "family", "solo"], imageUrl: "https://images.unsplash.com/photo-1563492065599-3520f775eeed?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1067, rating: 4.7, likesCount: 3760, featured: false, trending: true, popular: true, seasonal: false, bestMonths: [11, 12, 1, 2], transportModes: ["car", "rail"],
    en: { name: "Ayutthaya Historical Park", shortDescription: "Temple ruins and riverside history in Thailand's former capital.", description: "Cycle among brick prangs and monasteries, visit the Buddha head at Wat Mahathat, and follow the old capital's river loop." },
    th: { name: "อุทยานประวัติศาสตร์พระนครศรีอยุธยา", shortDescription: "โบราณสถานและประวัติศาสตร์ริมน้ำของอดีตราชธานีไทย", description: "ปั่นจักรยานชมพระปรางค์และวัดโบราณ เยี่ยมชมเศียรพระพุทธรูปที่วัดมหาธาตุ และเที่ยวรอบเกาะเมือง" },
  },
  {
    id: "20000000-0000-4000-8000-000000000004", slug: "yaowarat-road", scope: "thailand", countryCode: "TH", provinceCode: "BANGKOK", cityCode: "BANGKOK", latitude: 13.7408, longitude: 100.5082, address: "Yaowarat Road, Samphanthawong, Bangkok", categorySlugs: ["food", "city", "culture"], travelerTypes: ["foodie", "solo", "night-owl"], imageUrl: "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1107, rating: 4.6, likesCount: 4215, featured: false, trending: true, popular: true, seasonal: false, bestMonths: [1, 2, 3, 11, 12], transportModes: ["car", "rail", "transit", "airplane"],
    en: { name: "Yaowarat Road", shortDescription: "Bangkok's vivid Chinatown and a legendary street-food trail.", description: "Arrive hungry for charcoal-grilled seafood, pepper soup, dim sum, and desserts under Yaowarat's bright neon signs." },
    th: { name: "ถนนเยาวราช", shortDescription: "ไชน่าทาวน์สีสันสดใสและเส้นทางสตรีทฟู้ดระดับตำนาน", description: "ลิ้มลองอาหารทะเลย่าง ซุปพริกไทย ติ่มซำ และของหวานใต้แสงนีออนอันคึกคักของเยาวราช" },
  },
  {
    id: "20000000-0000-4000-8000-000000000005", slug: "khao-sok-national-park", scope: "thailand", countryCode: "TH", provinceCode: "SURAT-THANI", cityCode: "PHANOM", latitude: 8.9362, longitude: 98.5307, address: "Khlong Sok, Phanom, Surat Thani", categorySlugs: ["nature", "adventure"], travelerTypes: ["nature-lover", "adventurer", "couple"], imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1067, rating: 4.8, likesCount: 2988, featured: true, trending: true, popular: false, seasonal: true, bestMonths: [12, 1, 2, 3, 4], transportModes: ["car", "airplane"],
    en: { name: "Khao Sok National Park", shortDescription: "Ancient rainforest, emerald lake, and floating raft houses.", description: "Cross Cheow Lan Lake by long-tail boat, sleep over the water, and listen for gibbons on a guided rainforest walk." },
    th: { name: "อุทยานแห่งชาติเขาสก", shortDescription: "ป่าดิบชื้นโบราณ ทะเลสาบสีมรกต และแพพักกลางน้ำ", description: "ล่องเรือหางยาวในเขื่อนเชี่ยวหลาน พักบนแพกลางน้ำ และเดินป่าฟังเสียงชะนีกับไกด์ท้องถิ่น" },
  },
  {
    id: "20000000-0000-4000-8000-000000000006", slug: "santorini-caldera", scope: "worldwide", countryCode: "GR", provinceCode: null, cityCode: "SANTORINI", latitude: 36.3932, longitude: 25.4615, address: "Santorini, Cyclades, Greece", categorySlugs: ["beaches", "culture"], travelerTypes: ["couple", "photographer"], imageUrl: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1067, rating: 4.8, likesCount: 8160, featured: true, trending: false, popular: true, seasonal: true, bestMonths: [4, 5, 6, 9, 10], transportModes: ["airplane"],
    en: { name: "Santorini Caldera", shortDescription: "Whitewashed villages above a volcanic Aegean caldera.", description: "Walk the cliff path from Fira to Oia, explore volcanic beaches, and watch the sun set beyond the caldera." },
    th: { name: "แอ่งภูเขาไฟซานโตรินี", shortDescription: "หมู่บ้านสีขาวเหนือแอ่งภูเขาไฟแห่งทะเลอีเจียน", description: "เดินเส้นทางหน้าผาจากฟิราสู่อิยา เที่ยวชายหาดภูเขาไฟ และชมพระอาทิตย์ตกเหนือแอ่งภูเขาไฟ" },
  },
  {
    id: "20000000-0000-4000-8000-000000000007", slug: "kyoto-arashiyama", scope: "worldwide", countryCode: "JP", provinceCode: null, cityCode: "KYOTO", latitude: 35.0094, longitude: 135.6668, address: "Arashiyama, Kyoto, Japan", categorySlugs: ["culture", "nature"], travelerTypes: ["culture-seeker", "family", "photographer"], imageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1067, rating: 4.7, likesCount: 7250, featured: false, trending: true, popular: true, seasonal: true, bestMonths: [3, 4, 10, 11], transportModes: ["rail", "transit", "airplane"],
    en: { name: "Arashiyama, Kyoto", shortDescription: "Bamboo groves, temple gardens, and a quiet riverside district.", description: "Start early in the bamboo grove, visit Tenryu-ji's garden, and cross Togetsukyo Bridge toward forested hills." },
    th: { name: "อาราชิยามะ เกียวโต", shortDescription: "ป่าไผ่ สวนวัด และย่านริมน้ำอันเงียบสงบ", description: "เริ่มเช้าที่ป่าไผ่ เยี่ยมชมสวนวัดเท็นริวจิ และข้ามสะพานโทเก็ตสึเคียวไปยังเนินเขาเขียวขจี" },
  },
  {
    id: "20000000-0000-4000-8000-000000000008", slug: "banff-lake-louise", scope: "worldwide", countryCode: "CA", provinceCode: null, cityCode: "BANFF", latitude: 51.4254, longitude: -116.1773, address: "Lake Louise, Alberta, Canada", categorySlugs: ["nature", "adventure"], travelerTypes: ["nature-lover", "adventurer", "family"], imageUrl: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=85", imageWidth: 1600, imageHeight: 1067, rating: 4.9, likesCount: 10340, featured: true, trending: true, popular: true, seasonal: true, bestMonths: [6, 7, 8, 9], transportModes: ["car", "transit", "airplane"],
    en: { name: "Lake Louise, Banff", shortDescription: "Turquoise glacial water beneath the Canadian Rockies.", description: "Follow lakeside trails, climb toward a tea house, or paddle beneath peaks reflected in turquoise glacial water." },
    th: { name: "ทะเลสาบหลุยส์ แบมฟ์", shortDescription: "ทะเลสาบธารน้ำแข็งสีเทอร์ควอยซ์ใต้เทือกเขาร็อกกี", description: "เดินเส้นทางริมทะเลสาบ ขึ้นไปยังร้านน้ำชาบนเขา หรือพายเรือใต้ยอดเขาที่สะท้อนในน้ำสีเทอร์ควอยซ์" },
  },
];
