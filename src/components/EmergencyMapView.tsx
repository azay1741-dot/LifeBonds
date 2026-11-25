import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  InfoWindow,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  LocateFixed,
  Navigation,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { ReferralBookmark } from '../types';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';
const DEFAULT_CAMPUS_CENTER = { lat: 28.5672, lng: 77.21 }; // AIIMS / Medical District baseline

interface PlaceFacility {
  id: string;
  name: string;
  address: string;
  location: google.maps.LatLngLiteral;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  placeUri: string;
  category: ReferralBookmark['category'];
}

const CATEGORY_QUERIES: Array<{
  category: ReferralBookmark['category'];
  queryText: string;
}> = [
  { category: 'Pharmacy', queryText: '24 hour pharmacy near hospital' },
  { category: 'Outpatient Clinic', queryText: 'outpatient medical clinic' },
  { category: 'Diagnostics', queryText: 'diagnostic imaging laboratory' },
  { category: 'Blood Bank', queryText: 'blood bank donation center' },
  { category: 'Rehab Center', queryText: 'physical therapy rehabilitation center' },
];

function checkQuotaError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('Quota')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded', { detail: { type: 'api_quota' } }));
  }
}

function sanitizeFacilityId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned || `fac_${Date.now()}`;
}

function RoutePolylineOverlay({
  origin,
  destination,
  onRouteSummary,
}: {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral | null;
  onRouteSummary: (summary: { distanceKm: string; durationMin: number } | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!map || !routesLib || !destination) {
      onRouteSummary(null);
      return;
    }

    let cancelled = false;
    const request: google.maps.routes.ComputeRoutesRequest = {
      origin,
      destination,
      travelMode: routesLib.TravelMode.DRIVING,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    routesLib.Route.computeRoutes(request)
      .then(({ routes }) => {
        if (cancelled || !routes || routes.length === 0) {
          if (!cancelled) onRouteSummary(null);
          return;
        }
        const primaryRoute = routes[0];
        const created = primaryRoute.createPolylines({
          polylineOptions: {
            strokeColor: '#0f766e',
            strokeWeight: 5,
            strokeOpacity: 0.9,
          },
        });
        created.forEach((line) => line.setMap(map));
        polylinesRef.current = created;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        const meters = primaryRoute.distanceMeters ?? 0;
        const millis = primaryRoute.durationMillis ?? 0;
        onRouteSummary({
          distanceKm: (meters / 1000).toFixed(1),
          durationMin: Math.max(1, Math.round(millis / 60_000)),
        });
      })
      .catch((err) => {
        checkQuotaError(err);
        if (!cancelled) onRouteSummary(null);
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, routesLib, origin, destination, onRouteSummary]);

  return null;
}

function FacilityMarker({
  facility,
  selected,
  onSelect,
}: {
  facility: PlaceFacility;
  selected: boolean;
  onSelect: (fac: PlaceFacility | null) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={facility.location}
        title={facility.name}
        onClick={() => onSelect(facility)}
      >
        <Pin
          background={selected ? '#0f766e' : '#0284c7'}
          borderColor={selected ? '#134e4a' : '#0369a1'}
          glyphColor="#ffffff"
          scale={selected ? 1.2 : 1.0}
        />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} maxWidth={260} onCloseClick={() => onSelect(null)}>
          <div className="p-1 space-y-1 text-xs text-slate-800">
            <div className="font-semibold text-slate-900">{facility.name}</div>
            <div className="text-slate-600">{facility.address}</div>
            {facility.rating !== undefined && (
              <div className="text-slate-700">
                Rating: {facility.rating} ({facility.userRatingCount ?? 0} reviews)
              </div>
            )}
            <a
              href={facility.placeUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-teal-700 font-medium underline"
            >
              <span>Open in Google Maps</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapWorkspaceInner() {
  const { user } = useAuth();
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const apiStatus = useApiLoadingStatus();

  const [campusOrigin, setCampusOrigin] = useState<google.maps.LatLngLiteral>(DEFAULT_CAMPUS_CENTER);
  const [locationConsentGranted, setLocationConsentGranted] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ReferralBookmark['category']>('Pharmacy');
  const [searchInput, setSearchInput] = useState('24 hour pharmacy near hospital');
  const [facilities, setFacilities] = useState<PlaceFacility[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<PlaceFacility | null>(null);
  const [routeSummary, setRouteSummary] = useState<{ distanceKm: string; durationMin: number } | null>(null);
  const [searching, setSearching] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [bookmarks, setBookmarks] = useState<ReferralBookmark[]>([]);
  const [savingBookmarkId, setSavingBookmarkId] = useState<string | null>(null);
  const initialSearchDoneRef = useRef(false);

  // Real-time Firestore listener for user's saved referral facility bookmarks
  useEffect(() => {
    if (!user) {
      setBookmarks([]);
      return;
    }
    const bookmarksPath = `users/${user.uid}/bookmarks`;
    const q = query(collection(db, bookmarksPath), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ReferralBookmark[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ownerId: String(data.ownerId ?? user.uid),
            facilityId: String(data.facilityId ?? d.id),
            name: String(data.name ?? ''),
            category: (data.category as ReferralBookmark['category']) ?? 'Outpatient Clinic',
            address: String(data.address ?? ''),
            placeUri: String(data.placeUri ?? 'https://maps.google.com'),
            notes: String(data.notes ?? ''),
          };
        });
        setBookmarks(list);
      },
      (err) => {
        setMapError('Unable to sync saved referral bookmarks from Firestore.');
        handleFirestoreError(err, OperationType.GET, bookmarksPath);
      }
    );
    return () => unsub();
  }, [user]);

  const runSearch = useCallback(
    async (textQuery: string, category: ReferralBookmark['category'], center: google.maps.LatLngLiteral) => {
      if (!placesLib) return;
      setSearching(true);
      setMapError(null);
      try {
        const { places } = await placesLib.Place.searchByText({
          textQuery,
          fields: [
            'id',
            'displayName',
            'formattedAddress',
            'location',
            'rating',
            'userRatingCount',
            'businessStatus',
            'googleMapsURI',
          ],
          locationBias: center,
          maxResultCount: 10,
        });

        const mapped: PlaceFacility[] = (places ?? [])
          .filter((p) => p.location)
          .map((p) => {
            const loc = p.location!;
            const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
            const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
            return {
              id: sanitizeFacilityId(p.id || p.displayName || `${lat}_${lng}`),
              name: p.displayName || 'Medical Facility',
              address: p.formattedAddress || 'Address unavailable',
              location: { lat, lng },
              rating: p.rating ?? undefined,
              userRatingCount: p.userRatingCount ?? undefined,
              businessStatus: p.businessStatus ?? undefined,
              placeUri:
                p.googleMapsURI ||
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`,
              category,
            };
          });

        setFacilities(mapped);
        setSelectedFacility(mapped[0] ?? null);
        if (mapped[0] && map) {
          map.panTo(mapped[0].location);
        }
      } catch (err) {
        checkQuotaError(err);
        setMapError(err instanceof Error ? err.message : 'Unable to search nearby facilities.');
      } finally {
        setSearching(false);
      }
    },
    [placesLib, map]
  );

  useEffect(() => {
    if (placesLib && !initialSearchDoneRef.current) {
      initialSearchDoneRef.current = true;
      void runSearch('24 hour pharmacy near hospital', 'Pharmacy', DEFAULT_CAMPUS_CENTER);
    }
  }, [placesLib, runSearch]);

  function handleRequestLocation() {
    if (!navigator.geolocation) {
      setMapError('Browser geolocation is unavailable.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCampusOrigin(nextOrigin);
        setLocationConsentGranted(true);
        map?.panTo(nextOrigin);
        void runSearch(searchInput, activeCategory, nextOrigin);
      },
      (err) => {
        setMapError(`Location permission declined (${err.message}). Using default campus coordinates.`);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }

  function handleSubmitSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    void runSearch(searchInput.trim(), activeCategory, campusOrigin);
  }

  async function toggleBookmark(fac: PlaceFacility) {
    if (!user) return;
    const facId = sanitizeFacilityId(fac.id);
    const docPath = `users/${user.uid}/bookmarks/${facId}`;
    const isSaved = bookmarks.some((b) => b.facilityId === facId);
    setSavingBookmarkId(facId);
    setMapError(null);

    const rawName = fac.name.trim();
    const safeName = (rawName.length >= 2 ? rawName : 'Medical Facility').slice(0, 160);
    const rawAddress = fac.address.trim();
    const safeAddress = (rawAddress.length >= 2 ? rawAddress : 'Address unavailable').slice(0, 300);
    const safeNotes = `${fac.businessStatus ?? 'Verified'} · Non-emergency referral directory`.slice(0, 400);

    try {
      if (isSaved) {
        await deleteDoc(doc(db, 'users', user.uid, 'bookmarks', facId));
      } else {
        await setDoc(doc(db, 'users', user.uid, 'bookmarks', facId), {
          ownerId: user.uid,
          facilityId: facId,
          name: safeName,
          category: fac.category,
          address: safeAddress,
          placeUri: fac.placeUri.startsWith('https://')
            ? fac.placeUri.slice(0, 500)
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(safeName)}`,
          notes: safeNotes,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      setMapError('Unable to update referral bookmark in Firestore.');
      handleFirestoreError(err, isSaved ? OperationType.DELETE : OperationType.CREATE, docPath);
    } finally {
      setSavingBookmarkId(null);
    }
  }

  async function removeBookmarkById(facId: string) {
    if (!user) return;
    const docPath = `users/${user.uid}/bookmarks/${facId}`;
    setMapError(null);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'bookmarks', facId));
    } catch (err) {
      setMapError('Unable to remove referral bookmark.');
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }

  const bookmarkIds: Record<string, boolean> = {};
  for (const b of bookmarks) {
    bookmarkIds[b.facilityId] = true;
  }

  return (
    <div className="space-y-4">
      {/* Compliance & Scope Notice */}
      <div className="px-4 py-2.5 bg-teal-50/70 border border-teal-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs text-teal-900">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
          <span>
            <strong>Outpatient Referral &amp; Campus Wayfinding Only:</strong> Locate non-emergency pharmacies, diagnostic centers, and outpatient clinics. Do not use for 911/emergency ambulance routing or transmit patient medical records.
          </span>
        </div>
        <button
          type="button"
          onClick={handleRequestLocation}
          className="px-3 py-1 bg-white border border-teal-300 text-teal-800 hover:bg-teal-100 rounded-md font-medium inline-flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <LocateFixed className="w-3.5 h-3.5" />
          <span>{locationConsentGranted ? 'Campus GPS Active' : 'Share My Location'}</span>
        </button>
      </div>

      {/* Category & Search Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORY_QUERIES.map((item) => (
            <button
              key={item.category}
              type="button"
              onClick={() => {
                setActiveCategory(item.category);
                setSearchInput(item.queryText);
                void runSearch(item.queryText, item.category, campusOrigin);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeCategory === item.category
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {item.category}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmitSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search nearby pharmacies, outpatient clinics, diagnostics..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !placesLib}
            className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search Places'}
          </button>
        </form>

        {mapError && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
            {mapError}
          </div>
        )}
      </div>

      {/* Interactive Map + Results Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden h-[500px] relative">
          {(apiStatus === APILoadingStatus.FAILED || apiStatus === APILoadingStatus.AUTH_FAILURE) ? (
            <div className="h-full flex items-center justify-center p-6 text-xs text-red-700 bg-red-50">
              Google Maps failed to authenticate or reached quota. Verify your API key configuration.
            </div>
          ) : (
            <GoogleMap
              defaultCenter={campusOrigin}
              defaultZoom={13}
              mapId="DEMO_MAP_ID"
              gestureHandling="greedy"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <AdvancedMarker position={campusOrigin} title="Hospital Campus Origin">
                <Pin background="#0f172a" borderColor="#334155" glyphColor="#ffffff" scale={1.15} />
              </AdvancedMarker>

              {facilities.map((fac) => (
                <FacilityMarker
                  key={fac.id}
                  facility={fac}
                  selected={selectedFacility?.id === fac.id}
                  onSelect={setSelectedFacility}
                />
              ))}

              <RoutePolylineOverlay
                origin={campusOrigin}
                destination={selectedFacility?.location ?? null}
                onRouteSummary={setRouteSummary}
              />
            </GoogleMap>
          )}

          {routeSummary && selectedFacility && (
            <div className="absolute bottom-3 left-3 bg-white/95 border border-slate-200 rounded-lg px-3.5 py-2 shadow-sm text-xs flex items-center gap-2.5">
              <Navigation className="w-4 h-4 text-teal-700 shrink-0" />
              <div>
                <span className="font-semibold text-slate-900">{selectedFacility.name}:</span>{' '}
                <span className="font-mono tabular-nums text-slate-700">
                  {routeSummary.distanceKm} km · ~{routeSummary.durationMin} min drive
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Places Results + Saved Firestore Bookmarks */}
        <div className="lg:col-span-4 space-y-4">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Nearby Facilities ({facilities.length})
              </h3>
              <span className="text-[11px] text-slate-500">Places API (New)</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[260px] overflow-y-auto">
              {facilities.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">
                  {searching ? 'Querying nearby places...' : 'No facilities loaded yet.'}
                </div>
              ) : (
                facilities.map((fac) => {
                  const isSaved = Boolean(bookmarkIds[fac.id]);
                  const isSelected = selectedFacility?.id === fac.id;
                  return (
                    <div
                      key={fac.id}
                      className={`p-3 text-xs space-y-1 transition-colors ${
                        isSelected ? 'bg-teal-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFacility(fac);
                            map?.panTo(fac.location);
                          }}
                          className="font-semibold text-slate-900 text-left hover:text-teal-800 cursor-pointer"
                        >
                          {fac.name}
                        </button>
                        <button
                          type="button"
                          disabled={savingBookmarkId === fac.id}
                          onClick={() => void toggleBookmark(fac)}
                          aria-label={isSaved ? 'Remove bookmark' : 'Bookmark facility'}
                          className="p-1 text-teal-700 hover:bg-teal-100 rounded cursor-pointer shrink-0"
                        >
                          {isSaved ? (
                            <BookmarkCheck className="w-4 h-4" />
                          ) : (
                            <Bookmark className="w-4 h-4 text-slate-400" />
                          )}
                        </button>
                      </div>
                      <p className="text-slate-600 line-clamp-2">{fac.address}</p>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                Saved Referral Directory ({bookmarks.length})
              </h3>
              <span className="text-[11px] text-slate-500">Firestore Sync</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[190px] overflow-y-auto">
              {bookmarks.length === 0 ? (
                <div className="p-4 text-xs text-slate-500">
                  Bookmark outpatient facilities above to persist them to your staff directory.
                </div>
              ) : (
                bookmarks.map((b) => (
                  <div key={b.facilityId} className="p-3 text-xs flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{b.name}</div>
                      <div className="text-[11px] text-teal-700 font-medium">{b.category}</div>
                      <a
                        href={b.placeUri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-slate-500 hover:text-teal-700 underline inline-flex items-center gap-1 mt-0.5"
                      >
                        <span>Maps Link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeBookmarkById(b.facilityId)}
                      aria-label="Delete saved facility"
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function EmergencyMapView() {
  if (!MAPS_API_KEY) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-slate-600">
        Google Maps API key (`VITE_GOOGLE_MAPS_API_KEY`) is not currently injected in the environment.
      </div>
    );
  }

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      libraries={['places', 'routes', 'marker']}
      language="en"
      region="US"
    >
      <MapWorkspaceInner />
    </APIProvider>
  );
}
