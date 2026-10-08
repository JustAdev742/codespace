// Site facts the components need. Every value here comes from Square's store API or the live site
// (7 Oct 2026); none is a placeholder. Override any of them with configure() before mounting.

export const config = {
  storeApi: 'https://cdn5.editmysite.com/app/store/api/v28/editor/users/142918621/sites/483401922371572548',
  // A JSON array of store-API products to read instead of the live API (the local preview sets it).
  catalogueSrc: null,

  // Categories whose products count as bikes: New E-Bikes plus every brand page.
  bikeCategoryIds: [
    'B76QLFS4QYQNK4VKHGYURTOR', // New E-Bikes
    'EQKCEPRR522XJBUSCQAYDVFV', // Cyberbikes
    'KFNG7QQPOIUXQ7OCEO5TPKJ5', // Mamba
    'KG6OR6EPCVFYBM67KNHCNEBP', // Mono
    'JGOIYEUZY6IXGPIPCXLPEUZW', // Vamos
    'QCQV7VQQZH4XZFXGNWOI365C', // DiroDi
    'IARNAUHMMA3U4YWJI73QOTWC', // Eunorau
    'GRYBNUJW5MVF773GMGG6C5BS', // Lagads
    '7AZWGJVYTT7NKK7FK23QSXF4', // NCM
    'JTIJAQTBMQYVETB5WYBLN6XZ', // CRUZR
  ],
  brands: ['Cyberbikes', 'CRUZR', 'NCM', 'Eunorau', 'Vamos', 'DiroDi', 'Mamba', 'Mono', 'Lagads'],
  // Payment plans and deposits are listed as products but are not bikes.
  notABike: /rent[- ]to[- ]own|\bdeposit\b/i,
  minBikePrice: 600,

  links: {
    allBikes: '/shop/new-e-bikes/B76QLFS4QYQNK4VKHGYURTOR',
    finder: '/find-your-bike',
    booking: 'https://book.squareup.com/appointments/yl76djrlcxzi39/location/L00MTVMKAD143/services?buttonTextColor=000000&color=fed500&locale=en-AU&referrer=so',
    product: product => '/' + product.site_link,
  },

  store: {
    name: 'Cyberbikes',
    street: '281 Parramatta Rd',
    suburb: 'Leichhardt',
    state: 'NSW',
    postcode: '2040',
    phone: '+61491794668',
    email: 'info@cyberbikes.com',
    whatsapp: 'https://wa.me/61491794668',
    // Opening hours disagree between the Visit page, Square business hours and pickup hours (catalogue
    // audit #11), so none are shown until the owner sets them: [['Tue–Fri', '10am–5pm'], ...].
    hours: null,
  },

  // The facts every bike-in-box wording in the listings agrees on.
  boxNotice: {
    title: 'Online price: bike in a box',
    body: 'Bought online, your bike comes in its original box, unassembled, and we ship it or you collect it. '
      + 'Buy in store at 281 Parramatta Rd, Leichhardt and the price includes assembly.',
  },
};

export function configure(overrides = {}) {
  for (const [key, value] of Object.entries(overrides)) {
    config[key] = value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof RegExp)
      ? { ...config[key], ...value }
      : value;
  }
  return config;
}
