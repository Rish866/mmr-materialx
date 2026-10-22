/**
 * Seed realistic demo listings around MMR industrial hubs so the pilot feed
 * is never empty. Run AFTER migrate.  Usage: npm run seed
 */
require('dotenv').config();
const db = require('../src/db');

const HUBS = {
  Rabale:       { lat: 19.1360, lng: 73.0220 },
  'Taloja MIDC':{ lat: 19.0820, lng: 73.1000 },
  Bhiwandi:     { lat: 19.2800, lng: 72.8600 },
  Ulwe:         { lat: 18.9900, lng: 73.0260 },
  Vasai:        { lat: 19.3910, lng: 72.8260 },
};

const SELLERS = [
  { phone: '919820012345', name: 'Rajesh Sharma', business: 'Sharma Industries' },
  { phone: '919820022222', name: 'Imran Patel',  business: 'Patel Fabricators' },
  { phone: '919820033333', name: 'Sunil More',   business: 'More Polymers' },
];

const LISTINGS = [
  { cat: 'paints',    title: 'Leftover Epoxy Primer 20L (sealed)', qty: 200, unit: 'litres', price: 12000, pt: 'total',    urgent: true,  hub: 'Taloja MIDC' },
  { cat: 'metal',     title: 'MS Sheets 2mm surplus',              qty: 500, unit: 'kg',     price: 45,    pt: 'per_unit', urgent: false, hub: 'Bhiwandi' },
  { cat: 'polymer',   title: 'HDPE granules natural - 5 bags',     qty: 125, unit: 'kg',     price: 85,    pt: 'per_unit', urgent: true,  hub: 'Rabale' },
  { cat: 'packaging', title: 'Corrugated boxes 12x12 (lot)',       qty: 400, unit: 'pcs',    price: 6000,  pt: 'total',    urgent: false, hub: 'Ulwe' },
  { cat: 'metal',     title: 'SS 304 offcuts scrap',               qty: 300, unit: 'kg',     price: 120,   pt: 'per_unit', urgent: false, hub: 'Rabale' },
  { cat: 'chemicals', title: 'Industrial solvent thinner drums',   qty: 4,   unit: 'drum',   price: 3500,  pt: 'per_unit', urgent: true,  hub: 'Taloja MIDC' },
];

(async () => {
  // upsert sellers
  const sellerIds = {};
  for (const s of SELLERS) {
    const h = HUBS.Rabale;
    const { rows } = await db.query(
      `INSERT INTO users (phone, name, business_name, latitude, longitude, hub_name)
       VALUES ($1,$2,$3,$4,$5,'Rabale')
       ON CONFLICT (phone) DO UPDATE SET name=EXCLUDED.name, business_name=EXCLUDED.business_name
       RETURNING id`,
      [s.phone, s.name, s.business, h.lat, h.lng]
    );
    sellerIds[s.phone] = rows[0].id;
  }
  const sellerList = Object.values(sellerIds);

  for (let i = 0; i < LISTINGS.length; i++) {
    const l = LISTINGS[i];
    const hub = HUBS[l.hub];
    const sellerId = sellerList[i % sellerList.length];
    const expires = l.urgent ? new Date(Date.now() + 24 * 3600 * 1000) : null;
    await db.query(
      `INSERT INTO listings
        (user_id, category_id, title, quantity, unit, price, price_type,
         is_urgent, latitude, longitude, hub_name, photos, expires_at)
       VALUES ($1,(SELECT id FROM categories WHERE slug=$2),$3,$4,$5,$6,$7,$8,
               $9 + (random()-0.5)*0.02, $10 + (random()-0.5)*0.02, $11, $12, $13)`,
      [
        sellerId, l.cat, l.title, l.qty, l.unit, l.price, l.pt, l.urgent,
        hub.lat, hub.lng, l.hub,
        [`https://picsum.photos/seed/${l.cat}${i}/600/600`], expires,
      ]
    );
  }

  console.log(`seeded ${SELLERS.length} sellers and ${LISTINGS.length} listings`);
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
