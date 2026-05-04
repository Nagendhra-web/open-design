/**
 * Typed critiqueTheater i18n key constants for the Theater UI.
 *
 * Components call useT() from the i18n module and pass one of these string
 * literals. Having them here gives a single place to audit and ensures that
 * any rename in Dict types surfaces as a compile error before runtime.
 *
 * @see apps/web/src/i18n/types.ts
 */

export const CT = {
  userFacingName:        'critiqueTheater.userFacingName',
  roundLabel:            'critiqueTheater.roundLabel',
  ruleLineRunning:       'critiqueTheater.ruleLineRunning',
  ruleLineShipped:       'critiqueTheater.ruleLineShipped',
  ruleLineInterrupted:   'critiqueTheater.ruleLineInterrupted',
  densityActive:         'critiqueTheater.density.active',
  densitySmart:          'critiqueTheater.density.smart',
  densityExpanded:       'critiqueTheater.density.expanded',
  interrupt:             'critiqueTheater.interrupt',
  interrupting:          'critiqueTheater.interrupting',
  interruptConfirmTitle: 'critiqueTheater.interruptConfirmTitle',
  interruptConfirmBody:  'critiqueTheater.interruptConfirmBody',
  interruptConfirmYes:   'critiqueTheater.interruptConfirmYes',
  interruptConfirmNo:    'critiqueTheater.interruptConfirmNo',
  replayTitle:           'critiqueTheater.replay.title',
  replayReadOnly:        'critiqueTheater.replay.readOnly',
  replaySpeed1x:         'critiqueTheater.replay.speeds.1x',
  replaySpeed4x:         'critiqueTheater.replay.speeds.4x',
  replaySpeedInstant:    'critiqueTheater.replay.speeds.instant',
  degradedTitle:         'critiqueTheater.degraded.title',
  degradedRetry:         'critiqueTheater.degraded.retry',
  degradedSwitchAdapter: 'critiqueTheater.degraded.switchAdapter',
  degradedReadLog:       'critiqueTheater.degraded.readLog',
  shippedScore:          'critiqueTheater.shipped.score',
  shippedDimsLegend:     'critiqueTheater.shipped.dimsLegend',
  shippedExport:         'critiqueTheater.shipped.export',
  shippedRerun:          'critiqueTheater.shipped.rerun',
  interruptedTitle:      'critiqueTheater.interrupted.title',
  interruptedResume:     'critiqueTheater.interrupted.resume',
  interruptedShipAsIs:   'critiqueTheater.interrupted.shipAsIs',
  interruptedReBrief:    'critiqueTheater.interrupted.reBrief',
  panelistDesigner:      'critiqueTheater.panelist.designer',
  panelistCritic:        'critiqueTheater.panelist.critic',
  panelistBrand:         'critiqueTheater.panelist.brand',
  panelistA11y:          'critiqueTheater.panelist.a11y',
  panelistCopy:          'critiqueTheater.panelist.copy',
  noRunYet:              'critiqueTheater.noRunYet',
  settingsRowDescription: 'critiqueTheater.settingsRowDescription',
} as const;

export type CritiqueTheaterKey = (typeof CT)[keyof typeof CT];
