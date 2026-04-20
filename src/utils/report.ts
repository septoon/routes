import type { DayRecord, Stop } from './storage';

export const REPORT_START_DATE = '2026-04-01';

export type RouteReportEntry = {
  date: string;
  distance_km: number;
  route: string;
  request_numbers: string;
  period_start_odometer: number;
};

export type FuelReportEntry = {
  fuel_date: string;
  fuel_liters: number;
  fuel_cost_rub: number;
};

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function isReportDateEligible(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= REPORT_START_DATE;
}

function joinedAddresses(stops: Stop[]): string {
  return stops
    .map((stop) => cleanString(stop.address))
    .filter(Boolean)
    .join(' - ');
}

function joinedRequestNumbers(stops: Stop[]): string {
  return stops
    .map((stop) => cleanString(stop.requestNumber))
    .filter(Boolean)
    .join(' ');
}

function normalizeRouteReportEntry(raw: any): RouteReportEntry | null {
  const date = cleanString(raw?.date);
  if (!isReportDateEligible(date)) return null;

  return {
    date,
    distance_km: normalizeNumber(raw?.distance_km) ?? 0,
    route: cleanString(raw?.route),
    request_numbers: cleanString(raw?.request_numbers),
    period_start_odometer: normalizeNumber(raw?.period_start_odometer) ?? 0,
  };
}

export function normalizeFuelReportEntry(raw: any): FuelReportEntry | null {
  const fuelDate = cleanString(raw?.fuel_date);
  if (!isReportDateEligible(fuelDate)) return null;

  return {
    fuel_date: fuelDate,
    fuel_liters: normalizeNumber(raw?.fuel_liters) ?? 0,
    fuel_cost_rub: normalizeNumber(raw?.fuel_cost_rub) ?? 0,
  };
}

export function normalizeFuelReportEntries(raw: unknown): FuelReportEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeFuelReportEntry)
    .filter((item): item is FuelReportEntry => !!item)
    .sort((left, right) => left.fuel_date.localeCompare(right.fuel_date));
}

export function extractFuelReportEntries(payload: any): FuelReportEntry[] {
  const direct = normalizeFuelReportEntries(payload?.fuel_entries);
  if (direct.length > 0) return direct;
  return normalizeFuelReportEntries(payload?.routes);
}

export function buildRoutesReportEntries(
  days: Record<string, DayRecord>,
  existingRoutes: unknown = []
): RouteReportEntry[] {
  const existingByDate = new Map<string, RouteReportEntry>();

  if (Array.isArray(existingRoutes)) {
    existingRoutes.forEach((item) => {
      const normalized = normalizeRouteReportEntry(item);
      if (normalized) {
        existingByDate.set(normalized.date, normalized);
      }
    });
  }

  return Object.keys(days)
    .filter(isReportDateEligible)
    .sort((left, right) => left.localeCompare(right))
    .map((date) => {
      const record = days[date];
      const existing = existingByDate.get(date);

      return {
        date,
        distance_km: normalizeNumber(record?.distanceKm) ?? existing?.distance_km ?? 0,
        route: joinedAddresses(record?.stops ?? []),
        request_numbers: joinedRequestNumbers(record?.stops ?? []),
        period_start_odometer:
          normalizeNumber(record?.periodStartOdometer) ?? existing?.period_start_odometer ?? 0,
      };
    });
}
