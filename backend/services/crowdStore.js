/**
 * In-Memory Crowd Reporting Store
 * Stores user-reported crowdedness levels for specific route & stop pairs.
 */

class CrowdStore {
  constructor() {
    // Key: `${route_id}:${stop_id}` -> { route_id, stop_id, reported_level, offset, reported_at }
    this.reports = new Map();
  }

  /**
   * Add or update a crowdsourced crowd report
   * @param {Object} param0
   * @param {string} param0.route_id
   * @param {string} param0.stop_id
   * @param {"LOW"|"MEDIUM"|"HIGH"} param0.reported_level
   * @returns {Object} saved report
   */
  addReport({ route_id, stop_id, reported_level }) {
    if (!route_id || typeof route_id !== 'string') {
      throw new Error('route_id is required and must be a string');
    }
    if (!stop_id || typeof stop_id !== 'string') {
      throw new Error('stop_id is required and must be a string');
    }

    const normalizedLevel = reported_level ? reported_level.toUpperCase() : '';
    let offset = 0;
    if (normalizedLevel === 'LOW') {
      offset = -15;
    } else if (normalizedLevel === 'MEDIUM') {
      offset = 5;
    } else if (normalizedLevel === 'HIGH') {
      offset = 25;
    } else {
      throw new Error('reported_level must be one of "LOW", "MEDIUM", or "HIGH"');
    }

    const key = `${route_id.trim()}:${stop_id.trim()}`;
    const report = {
      route_id: route_id.trim(),
      stop_id: stop_id.trim(),
      reported_level: normalizedLevel,
      offset,
      reported_at: new Date().toISOString()
    };

    this.reports.set(key, report);
    return report;
  }

  /**
   * Get report for a specific route and stop
   */
  getReport(route_id, stop_id) {
    if (!route_id || !stop_id) return null;
    return this.reports.get(`${route_id.trim()}:${stop_id.trim()}`) || null;
  }

  /**
   * Get all active reports as an array
   */
  getAllReports() {
    return Array.from(this.reports.values());
  }

  /**
   * Get count of active reports
   */
  getCount() {
    return this.reports.size;
  }

  /**
   * Reset / clear all reports (used for demo resets)
   */
  reset() {
    const previousCount = this.reports.size;
    this.reports.clear();
    return previousCount;
  }
}

// Export singleton instance
export const crowdStore = new CrowdStore();
export default crowdStore;
