const fs = require('fs');

const smLines = fs.readFileSync('src/components/SettingsModal.jsx', 'utf8').split('\n');
let svLines = fs.readFileSync('src/components/SettingsView.jsx', 'utf8').split('\n');

const jsBlock = `
  const addAccountModalRef = useRef(null);
  const addPersonModalRef = useRef(null);
  const addBillModalRef = useRef(null);

  const trapFocus = (e, modalElement) => {
    if (!modalElement) return;
    const focusableElements = modalElement.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const focusable = Array.from(focusableElements).filter(
      el => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first || !modalElement.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !modalElement.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isAddAccountModalOpen) {
        if (e.key === 'Escape') setIsAddAccountModalOpen(false);
        else trapFocus(e, addAccountModalRef.current);
        return;
      }
      if (isAddPersonModalOpen) {
        if (e.key === 'Escape') setIsAddPersonModalOpen(false);
        else trapFocus(e, addPersonModalRef.current);
        return;
      }
      if (isAddBillModalOpen) {
        if (e.key === 'Escape') setIsAddBillModalOpen(false);
        else trapFocus(e, addBillModalRef.current);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddAccountModalOpen, isAddPersonModalOpen, isAddBillModalOpen]);

  const handleAddAccount = (e) => {
    e.preventDefault();
    if (!newAccForm.name) return;
    addAccount(newAccForm);
    setNewAccForm({ name: '', type: 'checking', startingBalance: 0, balanceAsOfDate: new Date().toISOString().split('T')[0], saveExtraMonthly: 0, extraStartingBalance: 0, enableExtraSavings: true, color: 'blue', notes: '' });
    setIsAddAccountModalOpen(false);
  };

  const handleAddPerson = (e) => {
    e.preventDefault();
    if (!newPersonForm.name) return;
    addPerson(newPersonForm);
    setNewPersonForm({ name: '', role: 'Member', payFrequency: 'bi-weekly', grossPerPay: 0, netPerPay: 0, payDay1: 15, payDay2: 'last', payOffsetDays: 0 });
    setIsAddPersonModalOpen(false);
  };

  const handleAddBill = (e) => {
    e.preventDefault();
    if (!newBillForm.name) return;
    addBill(newBillForm);
    setNewBillForm({ name: '', amount: 0, period: 'Monthly', accountId: budget.accounts[0]?.id || '', dueDay: 1, dueMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], paymentSource: 'Auto Pay', notes: '' });
    setIsAddBillModalOpen(false);
  };
`;

const accModal = smLines.slice(792, 934).join('\n');
const personModal = smLines.slice(1080, 1363).join('\n');
const billModal = smLines.slice(1671, 1844).join('\n');
const allModals = '\n' + accModal + '\n' + personModal + '\n' + billModal + '\n';

const insertHooksIdx = svLines.findIndex(l => l.includes('const [newBillForm, setNewBillForm] = useState(')) + 1;
svLines.splice(insertHooksIdx, 0, jsBlock);

const insertModalsIdx = svLines.findIndex(l => l.includes('</form>')) + 4;
svLines.splice(insertModalsIdx, 0, allModals);

fs.writeFileSync('src/components/SettingsView.jsx', svLines.join('\n'), 'utf8');
console.log('Successfully injected code!');
