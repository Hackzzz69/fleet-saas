/* Data layer — all queries are org-scoped (RLS enforces it too). */

const DB = {
  orgId: () => activeOrgId(),

  /* ---------- trucks ---------- */
  async trucks() {
    const { data, error } = await supabase.from("trucks")
      .select("*").eq("org_id", this.orgId()).order("unit_number");
    if (error) throw error; return data;
  },
  async addTruck(t) {
    const { data, error } = await supabase.from("trucks")
      .insert({ ...t, org_id: this.orgId() }).select().single();
    if (error) throw error; return data;
  },
  async deleteTruck(id) {
    const { error } = await supabase.from("trucks")
      .delete().eq("id", id).eq("org_id", this.orgId());
    if (error) throw error;
  },

  /* ---------- trips ---------- */
  async trips({ year, quarter, truckId } = {}) {
    let q = supabase.from("trips").select("*").eq("org_id", this.orgId());
    if (truckId && truckId !== "ALL") q = q.eq("truck_id", truckId);
    const qmap = { Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12] };
    if (year && year !== "ALL" && qmap[quarter]) {
      const y = Number(year);
      const qtr = qmap[quarter];
      const from = `${y}-${String(qtr[0]).padStart(2, "0")}-01`;
      const toM = qtr[1] === 12 ? 1 : qtr[1] + 1;
      const toY = qtr[1] === 12 ? y + 1 : y;
      const to = `${toY}-${String(toM).padStart(2, "0")}-01`;
      q = q.gte("date", from).lt("date", to);
    }
    const { data, error } = await q.order("date", { ascending: false }).limit(5000);
    if (error) throw error; return data;
  },
  async addTrip(t) {
    const user = await currentUser();
    const { data, error } = await supabase.from("trips")
      .insert({ ...t, org_id: this.orgId(), created_by: user.id })
      .select().single();
    if (error) throw error; return data;
  },
  async deleteTrip(id) {
    const { error } = await supabase.from("trips")
      .delete().eq("id", id).eq("org_id", this.orgId());
    if (error) throw error;
  },

  /* ---------- fuel ---------- */
  async fuel({ year, quarter, truckId } = {}) {
    let q = supabase.from("fuel_purchases").select("*").eq("org_id", this.orgId());
    if (truckId && truckId !== "ALL") q = q.eq("truck_id", truckId);
    const qmap = { Q1: [1, 3], Q2: [4, 6], Q3: [7, 9], Q4: [10, 12] };
    if (year && year !== "ALL" && qmap[quarter]) {
      const y = Number(year);
      const qtr = qmap[quarter];
      const from = `${y}-${String(qtr[0]).padStart(2, "0")}-01`;
      const toM = qtr[1] === 12 ? 1 : qtr[1] + 1;
      const toY = qtr[1] === 12 ? y + 1 : y;
      const to = `${toY}-${String(toM).padStart(2, "0")}-01`;
      q = q.gte("date", from).lt("date", to);
    }
    const { data, error } = await q.order("date", { ascending: false }).limit(5000);
    if (error) throw error; return data;
  },
  async addFuel(f) {
    const user = await currentUser();
    const { data, error } = await supabase.from("fuel_purchases")
      .insert({ ...f, org_id: this.orgId(), created_by: user.id })
      .select().single();
    if (error) throw error; return data;
  },
  async deleteFuel(id) {
    const { error } = await supabase.from("fuel_purchases")
      .delete().eq("id", id).eq("org_id", this.orgId());
    if (error) throw error;
  },

  /* ---------- filings ---------- */
  async filings(year) {
    let q = supabase.from("ifta_filings").select("*").eq("org_id", this.orgId());
    if (year && year !== "ALL") q = q.eq("year", Number(year));
    const { data, error } = await q.order("year", { ascending: false })
      .order("quarter", { ascending: false });
    if (error) throw error; return data;
  },
  async saveFiling(f) {
    const user = await currentUser();
    const { data, error } = await supabase.from("ifta_filings")
      .upsert({ ...f, org_id: this.orgId(), created_by: user.id },
        { onConflict: "org_id,year,quarter" })
      .select().single();
    if (error) throw error; return data;
  },
  async markFiled(id) {
    const { error } = await supabase.from("ifta_filings")
      .update({ status: "filed", filed_at: new Date().toISOString() })
      .eq("id", id).eq("org_id", this.orgId());
    if (error) throw error;
  },
};
