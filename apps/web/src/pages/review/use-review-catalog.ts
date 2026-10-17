import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../api.js';

/** Gyms and boulders for the review boulder picker, including a first gym when the library has none. */
export function useReviewCatalog() {
  const client = useQueryClient();
  const gyms = useQuery({ queryKey: ['gyms'], queryFn: () => api.gyms.list() });
  const boulders = useQuery({ queryKey: ['boulders'], queryFn: () => api.boulders.list() });

  const createBoulder = async (input: { grade: string; name: string; gymName: string }) => {
    const gymId =
      gyms.data?.items[0]?.id ?? (await api.gyms.create({ name: input.gymName, notes: '' })).id;
    const boulder = await api.boulders.create({
      gymId,
      grade: input.grade,
      color: 'unknown',
      ...(input.name ? { name: input.name } : {}),
    });
    await client.invalidateQueries({ queryKey: ['boulders'] });
    await client.invalidateQueries({ queryKey: ['gyms'] });
    return boulder.id;
  };

  return {
    boulders: (boulders.data?.items ?? []).map((boulder) => ({
      id: boulder.id,
      name: boulder.name,
      grade: boulder.grade,
    })),
    createBoulder,
  };
}
