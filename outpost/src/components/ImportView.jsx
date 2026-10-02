import React from 'react';
import { SpreadsheetImporterModal } from './SpreadsheetImporterModal';

/**
 * ImportView / SpreadsheetImporterModal component (HIGH-001 / FUNC-001).
 * Supports both modal invocation (`isOpen`, `onClose`, `onImportSuccess`) and
 * standalone inline view invocation when rendered directly into a page route.
 *
 * @param {{
 *   isOpen?: boolean,
 *   onClose?: () => void,
 *   onImportSuccess?: () => void,
 *   isStandalone?: boolean
 * }} props
 */
export function ImportView(props) {
  const { isOpen, onClose, onImportSuccess, isStandalone } = props;

  // If used in standalone mode without modal controls, provide a container
  if (isStandalone || isOpen === undefined) {
    return (
      <div className="w-full max-w-4xl mx-auto py-6 px-4">
        <SpreadsheetImporterModal
          isOpen={true}
          onClose={onClose || (() => {})}
          onImportSuccess={onImportSuccess || (() => {})}
        />
      </div>
    );
  }

  return (
    <SpreadsheetImporterModal
      isOpen={isOpen}
      onClose={onClose}
      onImportSuccess={onImportSuccess}
    />
  );
}

export { SpreadsheetImporterModal };
export default ImportView;
