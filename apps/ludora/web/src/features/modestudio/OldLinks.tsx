import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Spinner } from '../../ui/primitives.tsx';

/*
 * Old addresses, kept working: Mode Studio (/mode-studio, /mode-studio/<id>) is Game Maker now
 * (/game-maker), and the old saved-games page (/games) is Game Maker's "Saved games" tab.
 */
export function newAddress(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  if (/^\/games\/?$/.test(pathname)) {
    const community = params.get('tab') === 'community';
    params.set('tab', 'saved');
    if (community) params.set('saved', 'community');
    return `/game-maker?${params}`;
  }
  const rest = pathname.replace(/^\/mode-studio/, '');
  return `/game-maker${rest}${search}`;
}

export default function OldLinks() {
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`${newAddress(pathname, search)}${hash}`, { replace: true });
  }, [hash, navigate, pathname, search]);
  return <Spinner label="Opening Game Maker" />;
}
