'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  activitiesApi,
  cropCyclesApi,
  farmAlertsApi,
  farmersApi,
  farmsApi,
  governanceApi,
  insuranceApi,
  marketplaceApi,
  membershipsApi,
  notificationsApi,
  registryApi,
  rewardsApi,
  riceProtocolsApi,
} from '@/lib/api';

export const today = () => new Date().toISOString().slice(0, 10);
export const toIso = (date?: string) => (date ? new Date(date).toISOString() : undefined);
export const splitUrls = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

interface FarmerDataState {
  farmer: any;
  profile: any;
  farms: any[];
  cycles: any[];
  activities: any[];
  tasks: any[];
  alerts: any[];
  notifications: any[];
  membership: any;
  plans: any[];
  votes: any[];
  rewards: any[];
  registryRecords: any[];
  landListings: any[];
  tractors: any[];
  consents: any[];
  policies: any[];
  selectedCycleId: string;
  setSelectedCycleId: (id: string) => void;
  selectedFarmId: string;
  setSelectedFarmId: (id: string) => void;
  message: string;
  error: string;
  loading: boolean;
  cycleOptions: any[];
  farmsById: Map<string, any>;
  run: (action: () => Promise<unknown>, success: string) => Promise<void>;
  reload: () => Promise<void>;
}

const FarmerDataContext = createContext<FarmerDataState | null>(null);

export function useFarmerData() {
  const ctx = useContext(FarmerDataContext);
  if (!ctx) throw new Error('useFarmerData must be used within FarmerDataProvider');
  return ctx;
}

export function FarmerDataProvider({ children }: { children: ReactNode }) {
  const [farmer, setFarmer] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [farms, setFarms] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [membership, setMembership] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [registryRecords, setRegistryRecords] = useState<any[]>([]);
  const [landListings, setLandListings] = useState<any[]>([]);
  const [tractors, setTractors] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [selectedFarmId, setSelectedFarmId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadFarmer = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const farmerResult = await farmersApi.getMe();
      const currentFarmer = farmerResult.data;
      setFarmer(currentFarmer);
      const farmList = currentFarmer.farms || (await farmsApi.getByFarmerId(currentFarmer.id)).data || [];
      setFarms(farmList);
      const cycleResults = await Promise.allSettled(farmList.map((farm: any) => cropCyclesApi.getByFarmId(farm.id)));
      const nextCycles = cycleResults.flatMap((result) => result.status === 'fulfilled' ? result.value.data || [] : []);
      setCycles(nextCycles);
      setSelectedFarmId((current) => current || farmList[0]?.id || '');
      setSelectedCycleId((current) => current || nextCycles[0]?.id || '');

      const [
        profileResult,
        activityResult,
        alertResult,
        notificationResult,
        membershipResult,
        plansResult,
        votesResult,
        rewardsResult,
        registryResult,
        listingsResult,
        tractorsResult,
        consentResult,
        policiesResult,
      ] = await Promise.allSettled([
        farmersApi.financialProfile(currentFarmer.id),
        activitiesApi.recentForFarmer(currentFarmer.id, 12),
        farmAlertsApi.getAll(),
        notificationsApi.list(false),
        membershipsApi.me(),
        membershipsApi.listPlans(),
        governanceApi.votes(),
        rewardsApi.mine(),
        registryApi.mine(),
        marketplaceApi.getLandListings(),
        marketplaceApi.getTractors(),
        farmersApi.listConsents(currentFarmer.id),
        insuranceApi.getPoliciesForFarmer(currentFarmer.id),
      ]);

      if (profileResult.status === 'fulfilled') setProfile(profileResult.value.data);
      if (activityResult.status === 'fulfilled') setActivities(activityResult.value.data || []);
      if (alertResult.status === 'fulfilled') setAlerts(alertResult.value.data || []);
      if (notificationResult.status === 'fulfilled') setNotifications(notificationResult.value.data || []);
      if (membershipResult.status === 'fulfilled') setMembership(membershipResult.value.data);
      if (plansResult.status === 'fulfilled') setPlans(plansResult.value.data || []);
      if (votesResult.status === 'fulfilled') setVotes(votesResult.value.data || []);
      if (rewardsResult.status === 'fulfilled') setRewards(rewardsResult.value.data || []);
      if (registryResult.status === 'fulfilled') setRegistryRecords(registryResult.value.data || []);
      if (listingsResult.status === 'fulfilled') setLandListings(listingsResult.value.data || []);
      if (tractorsResult.status === 'fulfilled') setTractors(tractorsResult.value.data || []);
      if (consentResult.status === 'fulfilled') setConsents(consentResult.value.data || []);
      if (policiesResult.status === 'fulfilled') setPolicies(policiesResult.value.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No farmer profile is linked to this login yet. Ask MAYOData staff to link/register your farmer profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async (cycleId: string) => {
    if (!cycleId) {
      setTasks([]);
      return;
    }
    try {
      const result = await riceProtocolsApi.tasks(cycleId);
      setTasks(result.data || []);
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => { void loadFarmer(); }, [loadFarmer]);
  useEffect(() => { void loadTasks(selectedCycleId); }, [selectedCycleId, loadTasks]);

  const farmsById = new Map(farms.map((farm) => [farm.id, farm]));
  const cycleOptions = cycles.map((cycle) => ({
    ...cycle,
    label: `${cycle.season} · ${farmsById.get(cycle.farmId)?.farmCode || cycle.farm?.farmCode || 'Farm'}`,
  }));

  const run = async (action: () => Promise<unknown>, success: string) => {
    setMessage('');
    setError('');
    try {
      await action();
      setMessage(success);
      await loadFarmer();
      if (selectedCycleId) await loadTasks(selectedCycleId);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Action failed. Check the fields and try again.');
    }
  };

  const value: FarmerDataState = {
    farmer, profile, farms, cycles, activities, tasks, alerts, notifications, membership, plans,
    votes, rewards, registryRecords, landListings, tractors, consents, policies,
    selectedCycleId, setSelectedCycleId, selectedFarmId, setSelectedFarmId,
    message, error, loading, cycleOptions, farmsById, run, reload: loadFarmer,
  };

  return <FarmerDataContext.Provider value={value}>{children}</FarmerDataContext.Provider>;
}
