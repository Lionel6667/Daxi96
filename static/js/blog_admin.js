
var BLOG_ADMIN = { quill: null, editingId: null, tab: 'dashboard' };

async function blogAdminFetch(method, path, body, isForm) {
  var url = '/api/blog/' + path;
  var opts = {
    method: method,
    headers: { 'ngrok-skip-browser-warning': 'true' },
  };
  if (body) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  var r = await adminFetch(url, opts);
  if (!r.ok) {
    var err = {};
    try { err = await r.json(); } catch (e) {  }
    var msg = err.detail || err.error || err.message || ('HTTP ' + r.status);
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

function blogAdminShowTab(tab) {
  BLOG_ADMIN.tab = tab;
  ['dashboard', 'articles', 'categories', 'tags', 'editor'].forEach(function (t) {
    var el = document.getElementById('blog-admin-tab-' + t);
    if (el) el.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('[data-blog-tab]').forEach(function (btn) {
    btn.classList.toggle('bg-daxi-cyan', btn.dataset.blogTab === tab);
    btn.classList.toggle('text-gray-900', btn.dataset.blogTab === tab);
  });
  if (tab === 'dashboard') loadBlogDashboard();
  if (tab === 'articles') loadBlogArticles();
  if (tab === 'categories') loadBlogCategories();
  if (tab === 'tags') loadBlogTags();
}

async function loadBlogDashboard() {
  try {
    var d = await blogAdminFetch('GET', 'admin/dashboard/');
    document.getElementById('blog-stat-total').textContent = d.total;
    document.getElementById('blog-stat-published').textContent = d.published;
    document.getElementById('blog-stat-drafts').textContent = d.drafts;
    document.getElementById('blog-stat-categories').textContent = d.categories;
    document.getElementById('blog-stat-tags').textContent = d.tags;
    var top = document.getElementById('blog-top-views');
    if (top) top.innerHTML = (d.top_views || []).map(function (a) {
      return '<div class="flex justify-between text-sm py-2 border-b border-slate-700"><span>' + escapeHtml(a.title) + '</span><span class="text-daxi-cyan">' + a.view_count + ' vues</span></div>';
    }).join('') || '<p class="text-gray-500 text-sm">Aucune donnée</p>';
  } catch (e) {
    showToast(e.message || 'Erreur dashboard forum', 'error');
  }
}

async function loadBlogArticles() {
  var q = (document.getElementById('blog-filter-q') || {}).value || '';
  var st = (document.getElementById('blog-filter-status') || {}).value || '';
  var path = 'admin/articles/?' + new URLSearchParams({ search: q, status: st }).toString();
  try {
    var data = await blogAdminFetch('GET', path);
    var list = Array.isArray(data) ? data : (data.results || []);
    var el = document.getElementById('blog-articles-list');
    el.innerHTML = list.map(function (a) {
      return '<div class="bg-gray-800/90 rounded-xl p-4 flex flex-wrap gap-3 items-center border border-slate-700">'
        + '<input type="checkbox" class="blog-bulk-cb" value="' + a.id + '">'
        + '<div class="flex-1 min-w-[200px]"><div class="font-bold text-white">' + escapeHtml(a.title) + '</div>'
        + '<div class="text-xs text-gray-400">' + (a.category ? escapeHtml(a.category.name) : '—') + ' · ' + a.status + '</div></div>'
        + '<a href="/blog/' + a.slug + '/" target="_blank" class="text-xs text-daxi-cyan">Voir</a>'
        + '<button type="button" onclick="blogEditArticle(' + a.id + ')" class="admin-btn-icon"><i class="ri-edit-line"></i></button>'
        + '<button type="button" onclick="blogDuplicateArticle(' + a.id + ')" class="admin-btn-icon"><i class="ri-file-copy-line"></i></button>'
        + '<button type="button" onclick="blogDeleteArticle(' + a.id + ')" class="admin-btn-icon admin-btn-danger"><i class="ri-delete-bin-line"></i></button>'
        + '</div>';
    }).join('') || '<p class="text-gray-400">Aucun article.</p>';
  } catch (e) {
    showToast(e.message || 'Erreur chargement articles', 'error');
  }
}

async function loadBlogCategories() {
  try {
    var cats = await blogAdminFetch('GET', 'admin/categories/');
    var list = Array.isArray(cats) ? cats : (cats.results || []);
    document.getElementById('blog-categories-list').innerHTML = list.map(function (c) {
      return '<div class="flex flex-wrap items-center gap-3 bg-gray-800 rounded-xl p-3 border border-slate-700">'
        + '<input type="color" value="' + escapeHtml(c.color || '#6366f1') + '" class="w-10 h-10 rounded cursor-pointer shrink-0"'
        + ' onchange="blogUpdateCategory(' + c.id + ', null, this.value)" title="Couleur">'
        + '<input type="text" value="' + escapeHtml(c.name) + '" class="flex-1 min-w-[140px] px-3 py-2 bg-gray-900 rounded-lg text-white text-sm border border-slate-600"'
        + ' onchange="blogUpdateCategory(' + c.id + ', this.value, null)" title="Nom de la catégorie">'
        + '<span class="text-xs text-gray-500">' + (c.article_count || 0) + ' art.</span>'
        + '<button type="button" onclick="blogDeleteCategory(' + c.id + ')" class="admin-btn-icon admin-btn-danger" title="Supprimer"><i class="ri-delete-bin-line"></i></button>'
        + '</div>';
    }).join('') || '<p class="text-gray-400 text-sm">Aucune catégorie.</p>';
    var sel = document.getElementById('blog-editor-category');
    if (sel) sel.innerHTML = '<option value="">— Catégorie —</option>' + list.map(function (c) {
      return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    }).join('');
  } catch (e) {
    showToast(e.message || 'Erreur catégories', 'error');
  }
}

async function loadBlogTags() {
  try {
    var tags = await blogAdminFetch('GET', 'admin/tags/');
    var list = Array.isArray(tags) ? tags : (tags.results || []);
    document.getElementById('blog-tags-list').innerHTML = list.map(function (t) {
      return '<span class="inline-flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-lg text-sm">#' + escapeHtml(t.name)
        + '<button type="button" onclick="blogDeleteTag(' + t.id + ')" class="text-red-400"><i class="ri-close-line"></i></button></span>';
    }).join('') || '<p class="text-gray-400 text-sm">Aucun tag.</p>';
  } catch (e) {
    showToast(e.message || 'Erreur tags', 'error');
  }
}

function blogInitEditor() {
  if (BLOG_ADMIN.quill) return;
  if (typeof Quill === 'undefined') return;
  BLOG_ADMIN.quill = new Quill('#blog-quill-editor', {
    theme: 'snow',
    modules: {
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'code-block'],
          ['link', 'image', 'video'],
          ['clean']
        ],
        handlers: {
          image: function () {
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp,image/gif';
            input.onchange = async function () {
              var file = input.files && input.files[0];
              if (!file) return;
              var fd = new FormData();
              fd.append('image', file);
              try {
                var r = await adminFetch('/api/blog/admin/inline-image/', { method: 'POST', body: fd });
                var data = {};
                try { data = await r.json(); } catch (e) {}
                if (!r.ok || !data.url) throw new Error(data.error || 'Upload image échoué');
                var range = BLOG_ADMIN.quill.getSelection(true) || { index: BLOG_ADMIN.quill.getLength() };
                BLOG_ADMIN.quill.insertEmbed(range.index, 'image', data.url, 'user');
                BLOG_ADMIN.quill.setSelection(range.index + 1);
              } catch (err) {
                showToast(err.message || 'Upload image échoué', 'error');
              }
            };
            input.click();
          }
        }
      }
    }
  });
}

function blogNewArticle() {
  BLOG_ADMIN.editingId = null;
  blogAdminShowTab('editor');
  blogInitEditor();
  document.getElementById('blog-editor-title').value = '';
  document.getElementById('blog-editor-slug').value = '';
  document.getElementById('blog-editor-excerpt').value = '';
  document.getElementById('blog-editor-status').value = 'draft';
  var seo = document.getElementById('blog-editor-seo-title');
  var meta = document.getElementById('blog-editor-meta-desc');
  if (seo) seo.value = '';
  if (meta) meta.value = '';
  if (BLOG_ADMIN.quill) BLOG_ADMIN.quill.root.innerHTML = '';
}

async function blogEditArticle(id) {
  try {
    var a = await blogAdminFetch('GET', 'admin/articles/' + id + '/');
    BLOG_ADMIN.editingId = id;
    blogAdminShowTab('editor');
    blogInitEditor();
    document.getElementById('blog-editor-title').value = a.title || '';
    document.getElementById('blog-editor-slug').value = a.slug || '';
    document.getElementById('blog-editor-excerpt').value = a.excerpt || '';
    document.getElementById('blog-editor-status').value = a.status || 'draft';
    var seo = document.getElementById('blog-editor-seo-title');
    var meta = document.getElementById('blog-editor-meta-desc');
    if (seo) seo.value = a.seo_title || '';
    if (meta) meta.value = a.meta_description || '';
    if (BLOG_ADMIN.quill) BLOG_ADMIN.quill.root.innerHTML = a.content || '';
    var catSel = document.getElementById('blog-editor-category');
    if (catSel && a.category) catSel.value = a.category.id;
  } catch (e) {
    showToast(e.message || 'Erreur chargement article', 'error');
  }
}

async function blogSaveArticle(publish) {
  var fd = new FormData();
  fd.append('title', document.getElementById('blog-editor-title').value.trim());
  fd.append('slug', document.getElementById('blog-editor-slug').value.trim());
  fd.append('excerpt', document.getElementById('blog-editor-excerpt').value.trim());
  fd.append('content', BLOG_ADMIN.quill ? BLOG_ADMIN.quill.root.innerHTML : '');
  fd.append('status', publish ? 'published' : document.getElementById('blog-editor-status').value);
  var seo = document.getElementById('blog-editor-seo-title');
  var meta = document.getElementById('blog-editor-meta-desc');
  if (seo) fd.append('seo_title', seo.value.trim());
  if (meta) fd.append('meta_description', meta.value.trim());
  var cat = document.getElementById('blog-editor-category').value;
  if (cat) fd.append('category_id', cat);
  var cover = document.getElementById('blog-editor-cover');
  if (cover && cover.files[0]) fd.append('cover_image', cover.files[0]);
  if (!fd.get('title')) return showToast('Titre requis', 'warning');
  try {
    if (BLOG_ADMIN.editingId) {
      await blogAdminFetch('PATCH', 'admin/articles/' + BLOG_ADMIN.editingId + '/', fd, true);
    } else {
      await blogAdminFetch('POST', 'admin/articles/', fd, true);
    }
    showToast(publish ? 'Publication publiée' : 'Publication enregistrée');
    blogAdminShowTab('articles');
    loadBlogArticles();
  } catch (e) {
    showToast(e.message || 'Erreur enregistrement', 'error');
  }
}

async function blogDeleteArticle(id) {
  if (!confirm('Supprimer cette publication ?')) return;
  try {
    await blogAdminFetch('DELETE', 'admin/articles/' + id + '/');
    showToast('Publication supprimée');
    loadBlogArticles();
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
}

async function blogDuplicateArticle(id) {
  try {
    await blogAdminFetch('POST', 'admin/articles/' + id + '/duplicate/');
    showToast('Publication dupliquée');
    loadBlogArticles();
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
}

async function blogCreateCategory() {
  var name = (document.getElementById('blog-new-cat-name') || {}).value.trim();
  var color = (document.getElementById('blog-new-cat-color') || {}).value || '#6366f1';
  if (!name) return showToast('Nom requis', 'warning');
  try {
    await blogAdminFetch('POST', 'admin/categories/', { name: name, color: color });
    document.getElementById('blog-new-cat-name').value = '';
    showToast('Catégorie créée');
    loadBlogCategories();
  } catch (e) {
    showToast(e.message || 'Erreur création catégorie', 'error');
  }
}

async function blogUpdateCategory(id, name, color) {
  var payload = {};
  if (name) payload.name = name.trim();
  if (color) payload.color = color;
  if (!payload.name && !payload.color) return;
  try {
    await blogAdminFetch('PATCH', 'admin/categories/' + id + '/', payload);
    showToast('Catégorie mise à jour');
    loadBlogCategories();
  } catch (e) {
    showToast(e.message || 'Erreur mise à jour', 'error');
    loadBlogCategories();
  }
}

async function blogDeleteCategory(id) {
  if (!confirm('Supprimer cette catégorie ? Les articles gardent leur contenu sans catégorie.')) return;
  try {
    await blogAdminFetch('DELETE', 'admin/categories/' + id + '/');
    showToast('Catégorie supprimée');
    loadBlogCategories();
  } catch (e) {
    showToast(e.message || 'Erreur suppression', 'error');
  }
}

async function blogCreateTag() {
  var name = (document.getElementById('blog-new-tag-name') || {}).value.trim();
  if (!name) return showToast('Nom requis', 'warning');
  try {
    await blogAdminFetch('POST', 'admin/tags/', { name: name });
    document.getElementById('blog-new-tag-name').value = '';
    showToast('Tag créé');
    loadBlogTags();
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
}

async function blogDeleteTag(id) {
  if (!confirm('Supprimer ce tag ?')) return;
  try {
    await blogAdminFetch('DELETE', 'admin/tags/' + id + '/');
    showToast('Tag supprimé');
    loadBlogTags();
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
}

async function blogBulkAction(action) {
  var ids = Array.from(document.querySelectorAll('.blog-bulk-cb:checked')).map(function (c) { return +c.value; });
  if (!ids.length) return showToast('Sélectionnez des publications', 'warning');
  try {
    await blogAdminFetch('POST', 'admin/articles/bulk/', { ids: ids, action: action });
    showToast('Action effectuée');
    loadBlogArticles();
  } catch (e) {
    showToast(e.message || 'Erreur action groupée', 'error');
  }
}

function loadBlogAdmin() {
  blogAdminShowTab('dashboard');
  loadBlogCategories();
}
