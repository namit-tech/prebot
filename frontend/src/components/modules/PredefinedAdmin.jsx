import React, { useState, useEffect } from 'react';
import { useModule } from '../../context/ModuleContext';
import * as XLSX from 'xlsx';

const PredefinedAdmin = () => {
  const { getModuleInstance } = useModule();
  const [questions, setQuestions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: 'General'
  });

  const predefinedModule = getModuleInstance('predefined');

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = () => {
    if (predefinedModule) {
      setQuestions(predefinedModule.getQuestions());
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingId) {
        await predefinedModule.updateQuestion(
          editingId,
          formData.question,
          formData.answer,
          formData.category
        );
      } else {
        await predefinedModule.addQuestion(
          formData.question,
          formData.answer,
          formData.category
        );
      }

      loadQuestions();
      resetForm();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const handleEdit = (q) => {
    setFormData({
      question: q.question,
      answer: q.answer,
      category: q.category
    });
    setEditingId(q.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this question?')) {
      return;
    }

    try {
      await predefinedModule.deleteQuestion(id);
      loadQuestions();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({ question: '', answer: '', category: 'General' });
    setEditingId(null);
    setShowForm(false);
  };

  // Export to Excel
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(questions);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "PreBot_Questions.xlsx");
  };

  // Import from Excel
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (data && data.length > 0) {
            let addedCount = 0;
            for (const row of data) {
                // Determine fields (case-insensitive fallback)
                const q = row.question || row.Question || row.QUESTION;
                const a = row.answer || row.Answer || row.ANSWER;
                const c = row.category || row.Category || row.CATEGORY || 'General';

                if (q && a) {
                    await predefinedModule.addQuestion(q, a, c);
                    addedCount++;
                }
            }
            alert(`Successfully imported ${addedCount} questions!`);
            loadQuestions();
        } else {
            alert('No data found in the file.');
        }
      } catch (err) {
        console.error("Import Error:", err);
        alert("Error importing file: " + err.message);
      }
    };
    reader.readAsBinaryString(file);
    // Reset input
    e.target.value = null;
  };

  // Download Template
  const handleDownloadTemplate = (format) => {
    // structured data with headers and one example row
    const data = [
        { Question: "What is your return policy?", Answer: "You can return items within 30 days.", Category: "Support" }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    
    if (format === 'csv') {
        XLSX.writeFile(wb, "PreBot_QA_Template.csv", { bookType: "csv" });
    } else {
        XLSX.writeFile(wb, "PreBot_QA_Template.xlsx");
    }
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">
          Predefined Questions ({questions.length})
        </h2>
        
        <div className="flex gap-2 items-center">
            {/* Template Options */}
            <div className="mr-4 flex gap-1">
                <span className="text-xs text-gray-500 font-medium mr-1">Template:</span>
                <button onClick={() => handleDownloadTemplate('xlsx')} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded">XLSX</button>
                <button onClick={() => handleDownloadTemplate('csv')} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded">CSV</button>
            </div>

            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium text-sm flex items-center"
            >
              Export
            </button>
            <label className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm cursor-pointer flex items-center">
              Import
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                onChange={handleImport} 
                className="hidden" 
              />
            </label>
            <button
              onClick={() => setShowForm(!showForm)}
              className="btn-primary"
            >
              {showForm ? 'Cancel' : '+ Add Question'}
            </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Question
            </label>
            <input
              type="text"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Answer
            </label>
            <textarea
              value={formData.answer}
              onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
              className="input-field min-h-[100px]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category
            </label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="input-field"
            />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-primary">
              {editingId ? 'Update' : 'Add'} Question
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {questions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No questions yet. Add your first question!</p>
        ) : (
          questions.map((q) => (
            <div key={q.id} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{q.question}</p>
                  <p className="text-sm text-gray-600 mt-1">{q.answer}</p>
                  <span className="inline-block mt-2 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                    {q.category}
                  </span>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(q)}
                    className="px-3 py-1 text-sm bg-primary-100 text-primary-700 rounded hover:bg-primary-200"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PredefinedAdmin;

