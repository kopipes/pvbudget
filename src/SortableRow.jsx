import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PlusCircle, Trash2, GripVertical } from 'lucide-react';

function SortableRow({ 
    mainItem, mainIndex, threshold, isRealisasiMode, activeTab,
    canAddItems, canEditAllFields, formatCurrency, parseCurrency,
    updateMainItemName, addSubItem, removeMainItem, updateSubItem, removeSubItem,
    canEditActualRate, isRealizationForm, isManagerOrCorporate
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mainItem.id });
    const rowStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

    return (
        <>
            <tr ref={setNodeRef} style={rowStyle} className="row-main-item" data-main-id={mainItem.id}>
                <td style={{ padding: '0 4px' }}>
                    {canAddItems && (
                        <span {...attributes} {...listeners} style={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}>
                            <GripVertical size={16} />
                        </span>
                    )}
                </td>
                <td>
                    <input type="text" className="cell-input" value={mainItem.name} onChange={(e) => updateMainItemName(mainItem.id, mainIndex, e.target.value)} style={{ fontWeight: 700 }} disabled={!canEditAllFields} />
                </td>
                <td></td><td></td><td></td><td></td>
                {activeTab === 'realisasi' && <td></td>}
                {activeTab === 'po' && <td style={{ background: 'rgba(16,185,129,0.05)', width: '120px' }}></td>}
                <td className="col-actions" style={{ display: 'flex', gap: '4px' }}>
                    {canEditAllFields && (
                        <>
                            <button className="btn-icon btn-add-sub" title="Add Sub Item" onClick={() => addSubItem(mainItem.id, mainIndex)}><PlusCircle size={18} /></button>
                            <button className="btn-icon" title="Remove Main Item" onClick={() => removeMainItem(mainItem.id, mainIndex)}><Trash2 size={18} /></button>
                        </>
                    )}
                </td>
            </tr>
            {mainItem.subs.map((sub) => {
                const rowTotalInternal = sub.qty * sub.mdy * sub.internalRate;
                const rowTotalBudget = sub.qty * sub.mdy * sub.rate;
                return (
                    <SortableSubItem 
                        key={sub.id} 
                        sub={sub} 
                        mainItemId={mainItem.id}
                        canEditAllFields={canEditAllFields}
                        activeTab={activeTab}
                        canEditActualRate={canEditActualRate}
                        formatCurrency={formatCurrency}
                        parseCurrency={parseCurrency}
                        updateSubItem={updateSubItem}
                        removeSubItem={removeSubItem}
                        mainIndex={mainIndex}
                        isManagerOrCorporate={isManagerOrCorporate}
                    />
                );
            })}
        </>
    );
}

// Sub-item component with sortable capability - uses composite id (mainId_subId)
function SortableSubItem({ 
    sub, mainItemId, canEditAllFields, activeTab, canEditActualRate,
    formatCurrency, parseCurrency, updateSubItem, removeSubItem, mainIndex,
    isManagerOrCorporate 
}) {
    // Use composite id to make each sub-item sortable across all main items
    const sortableId = `${mainItemId}_${sub.id}`;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId });
    const rowStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

    const rowTotalInternal = sub.qty * sub.mdy * sub.internalRate;
    const rowTotalBudget = sub.qty * sub.mdy * sub.rate;

    return (
        <tr className="row-sub-item" ref={setNodeRef} style={rowStyle} data-sub-id={sub.id} data-parent-id={mainItemId}>
            <td style={{ padding: '0 4px', cursor: canEditAllFields ? 'grab' : 'default' }}>
                {canEditAllFields && (
                    <span {...attributes} {...listeners} style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', paddingLeft: '2px' }}>
                        <GripVertical size={14} />
                    </span>
                )}
            </td>
            <td><input type="text" className="cell-input" value={sub.name} onChange={(e) => updateSubItem(mainItemId, sub.id, 'name', e.target.value)} style={{ paddingLeft: '1rem' }} disabled={!canEditAllFields} /></td>
            <td><input type="number" className="cell-input align-center" value={sub.qty} onChange={(e) => updateSubItem(mainItemId, sub.id, 'qty', parseFloat(e.target.value) || 0)} disabled={!canEditAllFields} /></td>
            <td><input type="number" className="cell-input align-center" value={sub.mdy} onChange={(e) => updateSubItem(mainItemId, sub.id, 'mdy', parseFloat(e.target.value) || 0)} disabled={!canEditAllFields} /></td>
            <td>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem' }}>
                    <input type="text" className="cell-input align-right" value={sub.internalRate === 0 ? '' : formatCurrency(sub.internalRate)} onChange={(e) => updateSubItem(mainItemId, sub.id, 'internalRate', parseCurrency(e.target.value))} style={{ width: '45%' }} placeholder="Rate" disabled={!canEditAllFields} />
                    <div className="cell-readonly align-right" style={{ width: '50%' }}>{formatCurrency(rowTotalInternal)}</div>
                </div>
            </td>
            <td>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.5rem' }}>
                    <input type="text" className="cell-input align-right" value={sub.rate === 0 ? '' : formatCurrency(sub.rate)} onChange={(e) => updateSubItem(mainItemId, sub.id, 'rate', parseCurrency(e.target.value))} style={{ width: '45%' }} placeholder="Rate" disabled={!canEditAllFields} />
                    <div className="cell-readonly align-right" style={{ width: '50%', fontWeight: 600 }}>{formatCurrency(rowTotalBudget)}</div>
                </div>
            </td>
            {activeTab === 'realisasi' && (
                <td style={{ background: 'rgba(234,179,8,0.05)', padding: '0 0.5rem' }}>
                    <input type="text" className="cell-input align-right" value={sub.actualRate === 0 ? '' : formatCurrency(sub.actualRate)} onChange={(e) => updateSubItem(mainItemId, sub.id, 'actualRate', parseCurrency(e.target.value))} style={{ width: '100%', color: 'var(--primary)', fontWeight: 600 }} placeholder="Actual Total" disabled={!canEditActualRate(mainItemId)} />
                </td>
            )}
            {activeTab === 'po' && (
                <td style={{ background: 'rgba(16,185,129,0.05)', padding: '0 0.5rem', width: '120px' }}>
                    <input type="text" className="cell-input" value={sub.poNumber || ''} onChange={(e) => updateSubItem(mainItemId, sub.id, 'poNumber', e.target.value)} placeholder="PO Number" style={{ width: '100%', fontSize: '0.8rem', color: '#059669' }} disabled={!canEditAllFields && !isManagerOrCorporate} />
                </td>
            )}
            {activeTab === 'realisasi' && (
                <td style={{ background: 'rgba(16,185,129,0.05)', padding: '0 0.5rem', width: '100px' }}>
                    <span style={{ fontSize: '0.75rem', color: '#059669', fontFamily: 'monospace' }}>{sub.poNumber || '-'}</span>
                </td>
            )}
            <td className="col-actions">
                {canEditAllFields && <button className="btn-icon" title="Remove Sub Item" onClick={() => removeSubItem(mainItemId, mainIndex, sub.id)}><Trash2 size={18} /></button>}
            </td>
        </tr>
    );
}

export default SortableRow;