# Sampling locations for the national overview only. Search is not limited to these: it uses Nominatim.
# Each probe is one provider request per refresh, so this list is the national request budget.
PROBES = [
    ("Delhi", 28.6315, 77.2167),
    ("Mumbai", 19.0760, 72.8777),
    ("Bengaluru", 12.9716, 77.5946),
    ("Hyderabad", 17.3850, 78.4867),
    ("Chennai", 13.0827, 80.2707),
    ("Kolkata", 22.5726, 88.3639),
    ("Pune", 18.5204, 73.8567),
    ("Ahmedabad", 23.0225, 72.5714),
    ("Jaipur", 26.9124, 75.7873),
    ("Lucknow", 26.8467, 80.9462),
    ("Kanpur", 26.4499, 80.3319),
    ("Nagpur", 21.1458, 79.0882),
    ("Indore", 22.7196, 75.8577),
    ("Bhopal", 23.2599, 77.4126),
    ("Patna", 25.5941, 85.1376),
    ("Vadodara", 22.3072, 73.1812),
    ("Surat", 21.1702, 72.8311),
    ("Ludhiana", 30.9010, 75.8573),
    ("Chandigarh", 30.7333, 76.7794),
    ("Guwahati", 26.1445, 91.7362),
    ("Kochi", 9.9312, 76.2673),
    ("Coimbatore", 11.0168, 76.9558),
    ("Visakhapatnam", 17.6868, 83.2185),
    ("Bhubaneswar", 20.2961, 85.8245),
]
PROBE_RADIUS_DEG = 0.08
