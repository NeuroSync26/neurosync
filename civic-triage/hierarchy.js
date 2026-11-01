'use strict';
// India administrative hierarchy: Country > State/UT > District > City/Block/ULB > Locality/Institution.
// Compact line format:  S|name|lat|lng   D|name|lat|lng   C|name|lat|lng   L|name|lat|lng
// A district with no explicit C line gets a city/ULB of the same name. Users can also type a
// custom entry at any level ("Not listed"), so gaps in this dataset never block anyone.
const LEVELS = ['Country', 'State / UT', 'District', 'City / Block / ULB', 'Locality / Institution'];

const RAW = `
S|West Bengal|22.57|88.36
D|Alipurduar|26.49|89.53
D|Bankura|23.23|87.07
D|Birbhum|23.91|87.53
D|Cooch Behar|26.32|89.45
D|Dakshin Dinajpur|25.22|88.77
D|Darjeeling|27.04|88.26
D|Hooghly|22.90|88.39
D|Howrah|22.59|88.31
C|Howrah|22.59|88.31
L|Howrah Station Area|22.5839|88.3426
L|Shibpur|22.5560|88.3070
D|Jalpaiguri|26.54|88.72
D|Jhargram|22.45|86.99
D|Kalimpong|27.06|88.47
D|Kolkata|22.57|88.36
C|Kolkata|22.57|88.36
L|Salt Lake (Bidhannagar)|22.5867|88.4171
L|Park Street|22.5535|88.3520
L|Jadavpur|22.4990|88.3710
L|Behala|22.4986|88.3190
L|Ballygunge|22.5273|88.3660
L|Shyambazar|22.6012|88.3736
D|Malda|25.00|88.14
D|Murshidabad|24.10|88.25
D|Nadia|23.40|88.50
D|North 24 Parganas|22.72|88.48
D|Paschim Bardhaman|23.68|86.98
D|Paschim Medinipur|22.42|87.32
C|Kharagpur|22.346|87.232
L|IIT Kharagpur|22.3149|87.3105
L|Inda|22.3330|87.3150
L|Hijli|22.3150|87.3000
L|Malancha|22.3300|87.3000
L|Kharagpur Old Settlement|22.3460|87.2320
L|Kharagpur Railway Colony|22.3396|87.3200
C|Midnapore|22.4257|87.3199
L|Midnapore Town Centre|22.4257|87.3199
C|Ghatal|22.6670|87.7200
D|Purba Bardhaman|23.23|87.86
D|Purba Medinipur|22.30|87.92
D|Purulia|23.33|86.36
D|South 24 Parganas|22.50|88.33
D|Uttar Dinajpur|25.62|88.13
S|Delhi|28.61|77.21
D|New Delhi|28.61|77.21
D|South Delhi|28.52|77.22
D|North Delhi|28.70|77.20
D|East Delhi|28.63|77.30
D|West Delhi|28.65|77.10
S|Maharashtra|19.08|72.88
D|Mumbai City|18.96|72.82
C|Mumbai|18.96|72.82
D|Mumbai Suburban|19.08|72.88
D|Pune|18.52|73.86
D|Nagpur|21.15|79.09
D|Nashik|20.00|73.79
D|Thane|19.22|72.98
S|Karnataka|12.97|77.59
D|Bengaluru Urban|12.97|77.59
C|Bengaluru|12.97|77.59
D|Mysuru|12.30|76.64
D|Mangaluru|12.91|74.86
D|Belagavi|15.85|74.50
D|Hubballi-Dharwad|15.36|75.12
S|Tamil Nadu|13.08|80.27
D|Chennai|13.08|80.27
D|Coimbatore|11.02|76.96
D|Madurai|9.93|78.12
D|Tiruchirappalli|10.80|78.69
D|Salem|11.66|78.15
S|Uttar Pradesh|26.85|80.95
D|Lucknow|26.85|80.95
D|Varanasi|25.32|82.97
D|Kanpur Nagar|26.45|80.33
D|Agra|27.18|78.01
D|Prayagraj|25.43|81.85
D|Gautam Buddha Nagar|28.54|77.39
S|Bihar|25.61|85.14
D|Patna|25.61|85.14
D|Gaya|24.80|85.00
D|Muzaffarpur|26.12|85.39
D|Bhagalpur|25.24|86.97
S|Odisha|20.30|85.82
D|Khordha|20.30|85.82
C|Bhubaneswar|20.30|85.82
D|Cuttack|20.46|85.88
D|Puri|19.81|85.83
D|Sundargarh|22.12|84.04
S|Jharkhand|23.34|85.31
D|Ranchi|23.34|85.31
D|East Singhbhum|22.80|86.20
D|Dhanbad|23.80|86.43
D|Bokaro|23.67|86.15
S|Gujarat|23.02|72.57
D|Ahmedabad|23.02|72.57
D|Surat|21.17|72.83
D|Vadodara|22.31|73.18
D|Rajkot|22.30|70.80
S|Rajasthan|26.91|75.79
D|Jaipur|26.91|75.79
D|Jodhpur|26.24|73.02
D|Udaipur|24.59|73.71
D|Kota|25.21|75.86
S|Madhya Pradesh|23.26|77.41
D|Bhopal|23.26|77.41
D|Indore|22.72|75.86
D|Gwalior|26.22|78.18
D|Jabalpur|23.18|79.99
S|Telangana|17.38|78.48
D|Hyderabad|17.38|78.48
D|Warangal|17.97|79.59
D|Rangareddy|17.25|78.20
S|Andhra Pradesh|16.51|80.65
D|Krishna|16.51|80.65
D|Visakhapatnam|17.69|83.22
D|Guntur|16.31|80.44
D|Tirupati|13.63|79.42
S|Kerala|8.52|76.94
D|Thiruvananthapuram|8.52|76.94
D|Ernakulam|9.98|76.28
D|Kozhikode|11.26|75.78
D|Thrissur|10.52|76.21
S|Punjab|30.73|76.78
D|Ludhiana|30.90|75.86
D|Amritsar|31.63|74.87
D|Jalandhar|31.33|75.58
D|Patiala|30.34|76.39
S|Haryana|30.73|76.78
D|Gurugram|28.46|77.03
D|Faridabad|28.41|77.31
D|Ambala|30.38|76.78
D|Panipat|29.39|76.97
S|Assam|26.14|91.74
D|Kamrup Metropolitan|26.14|91.74
C|Guwahati|26.14|91.74
D|Dibrugarh|27.48|94.91
D|Cachar|24.83|92.78
D|Jorhat|26.75|94.20
S|Chhattisgarh|21.25|81.63
D|Raipur|21.25|81.63
D|Bilaspur|22.08|82.14
D|Durg|21.19|81.28
S|Uttarakhand|30.32|78.03
D|Dehradun|30.32|78.03
D|Haridwar|29.95|78.16
D|Nainital|29.38|79.46
S|Himachal Pradesh|31.10|77.17
D|Shimla|31.10|77.17
D|Kangra|32.10|76.27
D|Mandi|31.71|76.93
S|Goa|15.50|73.83
D|North Goa|15.50|73.83
D|South Goa|15.27|73.96
S|Jammu and Kashmir|34.08|74.80
D|Srinagar|34.08|74.80
D|Jammu|32.73|74.86
S|Ladakh|34.15|77.58
D|Leh|34.15|77.58
D|Kargil|34.56|76.13
S|Chandigarh|30.73|76.78
D|Chandigarh|30.73|76.78
S|Puducherry|11.93|79.83
D|Puducherry|11.93|79.83
S|Tripura|23.83|91.28
D|West Tripura|23.83|91.28
S|Meghalaya|25.57|91.88
D|East Khasi Hills|25.57|91.88
S|Manipur|24.82|93.94
D|Imphal West|24.82|93.94
S|Nagaland|25.67|94.11
D|Kohima|25.67|94.11
S|Mizoram|23.73|92.72
D|Aizawl|23.73|92.72
S|Arunachal Pradesh|27.10|93.62
D|Papum Pare|27.10|93.62
S|Sikkim|27.33|88.61
D|Gangtok|27.33|88.61
S|Andaman and Nicobar Islands|11.62|92.73
D|South Andaman|11.62|92.73
S|Dadra and Nagar Haveli and Daman and Diu|20.27|72.97
D|Daman|20.41|72.83
S|Lakshadweep|10.57|72.64
D|Kavaratti|10.57|72.64
`;

const tree = { n: 'India', g: [22.5, 79.0], c: [] };
(function build() {
  let S, D, C;
  const mk = (p, f) => ({ n: f[1], g: [+f[2], +f[3]], c: [] });
  for (const line of RAW.trim().split('\n')) {
    const f = line.split('|');
    if (f[0] === 'S') { S = mk(tree, f); tree.c.push(S); D = C = null; }
    else if (f[0] === 'D') { D = mk(S, f); S.c.push(D); C = null; }
    else if (f[0] === 'C') { C = mk(D, f); D.c.push(C); }
    else if (f[0] === 'L') { C.c.push(mk(C, f)); }
  }
  // districts without an explicit city get a default city/ULB with the same name
  for (const s of tree.c) for (const d of s.c) if (!d.c.length) d.c.push({ n: d.n, g: d.g, c: [] });
})();

function findNode(p) {
  let n = tree;
  if (!p || p[0] !== 'India') return null;
  for (let i = 1; i < p.length; i++) {
    n = n.c.find(x => x.n === p[i]);
    if (!n) return null;
  }
  return n;
}
// deepest known coordinates along the path
function coordsFor(p) {
  let n = tree, g = tree.g;
  for (let i = 1; i < (p || []).length; i++) {
    n = n.c.find(x => x.n === p[i]);
    if (!n) break;
    g = n.g;
  }
  return g;
}
module.exports = { tree, LEVELS, findNode, coordsFor };
