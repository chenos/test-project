import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useAuthorizationClient } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldError,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OptionSelect } from '../customers/option-select.js';
import { useDirectory, useOwners } from '../customers/use-owners.js';
import { useResource } from '../customers/use-resource.js';
import { ErrorFeedback, LoadingRows } from '../customers/feedback.js';
import { useConfirmation, type Confirm } from './confirm.js';

interface Team {
  id: string;
  name: string;
  active: boolean;
  version: number;
}
interface Member {
  teamId: string;
  active: boolean;
  isManager: boolean;
  version: number;
}
interface MemberDetail {
  member: Member | null;
  affectedCustomers: number;
  inconsistent: boolean;
}

function SaveError({ error, reload }: { error: unknown; reload: () => void }) {
  const { t } = useTranslation();
  if (error instanceof ApiClientError && [400, 409].includes(error.status))
    return (
      <Alert variant='destructive'>
        <AlertDescription>
          {t(error.status === 409 ? 'crmTeams.conflict' : 'crmTeams.invalid')}
          {error.status === 409 ? (
            <Button type='button' variant='outline' onClick={reload}>
              {t('customers.loadLatest')}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  return <ErrorFeedback error={error} />;
}

export default function CrmTeamsPage() {
  const { t } = useTranslation();
  const directory = useDirectory<Team>('crmTeams');
  const users = useOwners('crmTeamUsers');
  const [teamId, setTeamId] = useState('new');
  const [userId, setUserId] = useState('');
  const [pending, setPending] = useState(false);
  const stateRef = useRef({
    teamDirty: false,
    memberDirty: false,
    pending: false,
  });
  const teamState = useCallback((dirty: boolean, busy: boolean) => {
    stateRef.current.teamDirty = dirty;
    stateRef.current.pending = busy;
    setPending(busy);
  }, []);
  const memberState = useCallback((dirty: boolean, busy: boolean) => {
    stateRef.current.memberDirty = dirty;
    stateRef.current.pending = busy;
    setPending(busy);
  }, []);
  const confirmation = useConfirmation();
  const selected = directory.data?.find((team) => team.id === teamId);
  const user = users.data?.find((u) => u.id === userId);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        stateRef.current.teamDirty ||
        stateRef.current.memberDirty ||
        stateRef.current.pending
      )
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function change(run: () => void) {
    if (stateRef.current.pending) return;
    if (
      (stateRef.current.teamDirty || stateRef.current.memberDirty) &&
      !(await confirmation.request(
        t('customers.discard.title'),
        t('customers.discard.description'),
      ))
    )
      return;
    stateRef.current.teamDirty = false;
    stateRef.current.memberDirty = false;
    run();
  }
  const reload = () => {
    directory.reload();
    users.reload();
  };
  return (
    <PageContainer>
      <PageHeader
        title={t('crmTeams.title')}
        description={t('crmTeams.description')}
        actions={
          <Button variant='outline' onClick={() => void change(reload)}>
            {t('crmTeams.refresh')}
          </Button>
        }
      />
      <div className='flex max-w-4xl flex-col gap-6'>
        {directory.error ? (
          <ErrorFeedback error={directory.error} retry={directory.reload} />
        ) : !directory.data ? (
          <LoadingRows />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t('crmTeams.team')}</CardTitle>
                <CardDescription>
                  {t('crmTeams.teamDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>{t('crmTeams.team')}</FieldLabel>
                    <OptionSelect
                      label={t('crmTeams.team')}
                      value={teamId}
                      disabled={pending}
                      options={[
                        { value: 'new', label: t('crmTeams.newTeam') },
                        ...directory.data.map((team) => ({
                          value: team.id,
                          label: team.name,
                        })),
                      ]}
                      onChange={(id) => void change(() => setTeamId(id))}
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
              <TeamForm
                key={`${teamId}:${selected?.version ?? 0}`}
                team={selected}
                confirm={confirmation.request}
                onState={teamState}
                onSaved={(team) => {
                  stateRef.current.teamDirty = false;
                  directory.setData([
                    team,
                    ...directory.data!.filter((item) => item.id !== team.id),
                  ]);
                  setTeamId(team.id);
                  directory.reload();
                }}
                reload={() => {
                  stateRef.current.teamDirty = false;
                  directory.reload();
                }}
              />
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('crmTeams.membership')}</CardTitle>
                <CardDescription>
                  {t('crmTeams.memberDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!directory.data.length ? (
                  <p className='text-muted-foreground'>
                    {t('crmTeams.noTeams')}
                  </p>
                ) : users.error ? (
                  <ErrorFeedback error={users.error} retry={users.reload} />
                ) : !users.data ? (
                  <LoadingRows />
                ) : (
                  <FieldGroup>
                    <Field>
                      <FieldLabel>{t('crmTeams.user')}</FieldLabel>
                      <OptionSelect
                        label={t('crmTeams.user')}
                        value={userId}
                        disabled={pending}
                        options={[
                          { value: '', label: t('crmTeams.selectUser') },
                          ...users.data.map((u) => ({
                            value: u.id,
                            label: u.name,
                          })),
                        ]}
                        onChange={(id) => void change(() => setUserId(id))}
                      />
                    </Field>
                  </FieldGroup>
                )}
              </CardContent>
              {user && directory.data.length ? (
                <MemberLoader
                  key={user.id}
                  user={user}
                  teams={directory.data}
                  confirm={confirmation.request}
                  onState={memberState}
                />
              ) : (
                <CardFooter />
              )}
            </Card>
          </>
        )}
      </div>
      {confirmation.dialog}
    </PageContainer>
  );
}

function TeamForm({
  team,
  confirm,
  onState,
  onSaved,
  reload,
}: {
  team?: Team;
  confirm: Confirm;
  onState: (dirty: boolean, pending: boolean) => void;
  onSaved: (team: Team) => void;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const authz = useAuthorizationClient();
  const [name, setName] = useState(team?.name ?? '');
  const [active, setActive] = useState(team?.active ?? true);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<unknown>();
  const inputRef = useRef<HTMLInputElement>(null);
  const dirty =
    name !== (team?.name ?? '') || active !== (team?.active ?? true);
  const invalid = submitted && (!name.trim() || name.trim().length > 200);
  useEffect(() => {
    onState(dirty, pending);
  }, [onState, dirty, pending]);
  async function save() {
    setSubmitted(true);
    if (!name.trim() || name.trim().length > 200) {
      inputRef.current?.focus();
      return;
    }
    if (
      team?.active &&
      !active &&
      !(await confirm(
        t('crmTeams.disableTitle', { name: team.name }),
        t('crmTeams.disableDescription'),
      ))
    )
      return;
    setPending(true);
    setError(undefined);
    try {
      const { data } = await api.request<{ data: Team }>({
        path: team ? `crmTeams/${encodeURIComponent(team.id)}` : 'crmTeams',
        method: team ? 'PATCH' : 'POST',
        json: {
          name: name.trim(),
          active,
          ...(team ? { version: team.version } : {}),
        },
      });
      onState(false, false);
      onSaved(data);
      authz.invalidate();
      toaster.show({
        type: 'success',
        title: t('crmTeams.saved', { name: data.name }),
      });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) void save();
      }}
    >
      <CardContent>
        <FieldGroup>
          {error ? <SaveError error={error} reload={reload} /> : null}
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor='team-name'>{t('crmTeams.name')} *</FieldLabel>
            <Input
              id='team-name'
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              aria-required
              aria-invalid={invalid}
            />
            <FieldError>
              {invalid ? t('crmTeams.requiredName') : null}
            </FieldError>
          </Field>
          <Field>
            <FieldLabel>{t('crmTeams.state')}</FieldLabel>
            <OptionSelect
              label={t('crmTeams.state')}
              value={active ? 'enabled' : 'disabled'}
              onChange={(value) => setActive(value === 'enabled')}
              disabled={pending}
              options={[
                { value: 'enabled', label: t('crmTeams.enabled') },
                { value: 'disabled', label: t('crmTeams.disabled') },
              ]}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className='mt-4 justify-end'>
        <Button type='submit' disabled={pending || (Boolean(team) && !dirty)}>
          {pending ? <Spinner data-icon='inline-start' /> : null}
          {t('actions.save')}
        </Button>
      </CardFooter>
    </form>
  );
}

function MemberLoader({
  user,
  teams,
  confirm,
  onState,
}: {
  user: { id: string; name: string };
  teams: Team[];
  confirm: Confirm;
  onState: (dirty: boolean, pending: boolean) => void;
}) {
  const result = useResource<{ data: MemberDetail }>(
    `crmTeamMembers/${encodeURIComponent(user.id)}`,
  );
  return result.error ? (
    <CardContent>
      <ErrorFeedback error={result.error} retry={result.reload} />
    </CardContent>
  ) : !result.data ? (
    <CardContent>
      <LoadingRows />
    </CardContent>
  ) : (
    <MemberForm
      key={`${user.id}:${result.data.data.member?.version ?? 0}`}
      user={user}
      teams={teams}
      detail={result.data.data}
      confirm={confirm}
      onState={onState}
      reload={result.reload}
      onSaved={(member) =>
        result.setData({ data: { ...result.data!.data, member } })
      }
    />
  );
}
function MemberForm({
  user,
  teams,
  detail,
  confirm,
  onState,
  reload,
  onSaved,
}: {
  user: { id: string; name: string };
  teams: Team[];
  detail: MemberDetail;
  confirm: Confirm;
  onState: (dirty: boolean, pending: boolean) => void;
  reload: () => void;
  onSaved: (member: Member) => void;
}) {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();
  const authz = useAuthorizationClient();
  const member = detail.member;
  const [teamId, setTeamId] = useState(member?.teamId ?? '');
  const [active, setActive] = useState(member?.active ?? true);
  const [manager, setManager] = useState(member?.isManager ?? false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<unknown>();
  const teamRef = useRef<HTMLButtonElement>(null);
  const dirty =
    teamId !== (member?.teamId ?? '') ||
    active !== (member?.active ?? true) ||
    manager !== (member?.isManager ?? false);
  const invalid =
    submitted &&
    !teams.some((team) => team.id === teamId && (!active || team.active));
  useEffect(() => {
    onState(dirty, pending);
  }, [onState, dirty, pending]);
  async function save() {
    setSubmitted(true);
    if (!teams.some((team) => team.id === teamId && (!active || team.active))) {
      teamRef.current?.focus();
      return;
    }
    const moving = Boolean(member && teamId !== member.teamId);
    if (
      (moving || (member?.active && !active)) &&
      !(await confirm(
        t(moving ? 'crmTeams.moveTitle' : 'crmTeams.disableTitle', {
          name: user.name,
        }),
        t(moving ? 'crmTeams.moveDescription' : 'crmTeams.disableDescription'),
      ))
    )
      return;
    setPending(true);
    setError(undefined);
    try {
      const { data } = await api.request<{ data: Member }>({
        path: `crmTeamMembers/${encodeURIComponent(user.id)}`,
        method: 'PUT',
        json: {
          teamId,
          active,
          isManager: manager,
          version: member?.version ?? 0,
          confirmImpact: moving,
        },
      });
      onState(false, false);
      onSaved(data);
      authz.invalidate();
      reload();
      toaster.show({
        type: 'success',
        title: t('crmTeams.saved', { name: user.name }),
      });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) void save();
      }}
    >
      <CardContent>
        <FieldGroup>
          {error ? <SaveError error={error} reload={reload} /> : null}
          <p className='text-muted-foreground'>
            {t('crmTeams.impact', { count: detail.affectedCustomers })}
          </p>
          {detail.inconsistent ? (
            <Alert role='status'>
              <AlertDescription>{t('crmTeams.inconsistent')}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={invalid}>
            <FieldLabel>{t('crmTeams.team')} *</FieldLabel>
            <OptionSelect
              inputRef={teamRef}
              label={t('crmTeams.team')}
              value={teamId}
              invalid={invalid}
              required
              disabled={pending}
              onChange={setTeamId}
              options={[
                { value: '', label: t('crmTeams.selectTeam') },
                ...teams
                  .filter((team) => team.active || team.id === member?.teamId)
                  .map((team) => ({ value: team.id, label: team.name })),
              ]}
            />
            <FieldError>
              {invalid ? t('crmTeams.requiredTeam') : null}
            </FieldError>
          </Field>
          <Field>
            <FieldLabel>{t('crmTeams.role')}</FieldLabel>
            <OptionSelect
              label={t('crmTeams.role')}
              value={manager ? 'manager' : 'sales'}
              onChange={(value) => setManager(value === 'manager')}
              disabled={pending}
              options={[
                { value: 'sales', label: t('crmTeams.sales') },
                { value: 'manager', label: t('crmTeams.manager') },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel>{t('crmTeams.state')}</FieldLabel>
            <OptionSelect
              label={t('crmTeams.state')}
              value={active ? 'enabled' : 'disabled'}
              onChange={(value) => setActive(value === 'enabled')}
              disabled={pending}
              options={[
                { value: 'enabled', label: t('crmTeams.enabled') },
                { value: 'disabled', label: t('crmTeams.disabled') },
              ]}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className='mt-4 justify-end'>
        <Button type='submit' disabled={pending || !dirty}>
          {pending ? <Spinner data-icon='inline-start' /> : null}
          {t('actions.save')}
        </Button>
      </CardFooter>
    </form>
  );
}
