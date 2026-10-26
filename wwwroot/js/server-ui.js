(() => {
    const byId = id => document.getElementById(id);

    byId('open-create')?.addEventListener('click', () => byId('create-dialog').showModal());

    // Fills the edit server dialog with the clicked server's id and name before opening it.
    document.querySelectorAll('.srv-edit').forEach(button => {
        button.addEventListener('click', () => {
            byId('edit-id').value = button.dataset.id;
            byId('delete-id').value = button.dataset.id;
            byId('edit-name').value = button.dataset.name;
            byId('new-categories').innerHTML = ''; // the dialog is reused, so drop fields from last time
            byId('edit-dialog').showModal();
        });
    });

    byId('add-category-input')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.name = 'NewCategories';
        input.className = 'srv-input';
        input.maxLength = 32;
        input.placeholder = 'Category name';
        byId('new-categories').appendChild(input);
        input.focus();
    });

    // Fills the edit category dialog with the clicked category's id and name before opening it.
    document.querySelectorAll('.srv-cat-edit').forEach(button => {
        button.addEventListener('click', () => {
            byId('edit-category-id').value = button.dataset.id;
            byId('delete-category-id').value = button.dataset.id;
            byId('edit-category-name').value = button.dataset.name;
            byId('edit-category-dialog').showModal();
        });
    });

    // The "+" next to a category name opens the add channel dialog for that category.
    document.querySelectorAll('.srv-cat-add').forEach(button => {
        button.addEventListener('click', () => {
            byId('create-channel-category-id').value = button.dataset.categoryId;
            byId('create-channel-category').textContent = button.dataset.categoryName;
            byId('create-channel-name').value = '';
            document.querySelector('#create-channel-dialog input[value="Text"]').checked = true;
            document.querySelector('#create-channel-dialog input[name="ReadOnly"]').checked = false;
            byId('create-channel-readonly-row').style.display = '';
            byId('create-channel-dialog').showModal();
        });
    });

    // Read-only only applies to text channels, so hide that option while "Voice" is selected.
    document.querySelectorAll('#create-channel-dialog input[name="Type"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const isVoice = document.querySelector('#create-channel-dialog input[name="Type"]:checked').value === 'Voice';
            byId('create-channel-readonly-row').style.display = isVoice ? 'none' : '';
        });
    });

    // Fills the edit channel dialog with the clicked channel's data before opening it.
    document.querySelectorAll('.srv-chan-edit').forEach(button => {
        button.addEventListener('click', () => {
            byId('edit-channel-id').value = button.dataset.id;
            byId('delete-channel-id').value = button.dataset.id;
            byId('edit-channel-name').value = button.dataset.name;
            byId('edit-channel-readonly').checked = button.dataset.readonly === 'true';
            byId('edit-channel-readonly-row').style.display = button.dataset.type === 'Voice' ? 'none' : '';
            byId('edit-channel-dialog').showModal();
        });
    });

    document.querySelectorAll('[data-close]').forEach(button =>
        button.addEventListener('click', () => button.closest('dialog').close()));

    // ---- Saving a new order ----

    // Sends the new order to the server as JSON. Returns true if it was saved.
    // The anti-forgery token is the one the dialog forms contain; the server rejects the request without it.
    const saveOrder = async (url, body) => {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'RequestVerificationToken':
                        document.querySelector('input[name="__RequestVerificationToken"]')?.value ?? ''
                },
                body
            });
            return response.ok;
        } catch {
            return false; // network error
        }
    };

    // Shown when saving fails. Reloading shows the order the database actually has.
    const saveFailed = () => {
        alert('Could not save the new order.');
        location.reload();
    };

    // ---- Drag and drop reordering of categories and channels ----
    // While dragging, the element is moved in the page right away. When it is dropped,
    // the new order of everything is sent to the server in one request.
    const channelList = document.querySelector('.srv-channels'); // only exists while a server is open

    if (channelList) {
        let dragged = null; // what is being dragged: { type: 'channel' | 'category', el: the element to move }

        // The current order in the page, in the shape ServersController.Reorder expects.
        const readLayout = () => ({
            serverId: Number(channelList.dataset.serverId),
            categories: [...channelList.querySelectorAll('.srv-cat')].map(cat => ({
                id: Number(cat.dataset.categoryId),
                channelIds: [...cat.querySelectorAll('.srv-chan-row')].map(row => Number(row.dataset.channelId))
            }))
        });

        let savedLayout = JSON.stringify(readLayout()); // the order the database has right now

        // The first item whose middle is below the mouse. The dragged item goes in front of it.
        // Null means the mouse is below all items, so the dragged item goes last.
        const itemAfterMouse = (container, selector, mouseY) =>
            [...container.querySelectorAll(selector)]
                .filter(item => item !== dragged.el)
                .find(item => {
                    const box = item.getBoundingClientRect();
                    return mouseY < box.top + box.height / 2;
                }) ?? null;

        // Moves the element, unless it is already there (avoids pointless page updates while dragging).
        const place = (container, el, before) => {
            if (el.parentElement === container && el.nextElementSibling === before) return;
            container.insertBefore(el, before);
        };

        // Runs when the user starts dragging a channel or category: remembers what is being dragged and fades it out.
        channelList.addEventListener('dragstart', e => {
            const row = e.target.closest('.srv-chan-row');
            const header = e.target.closest('.srv-category');

            if (row) dragged = {type: 'channel', el: row};
            else if (header) dragged = {type: 'category', el: header.closest('.srv-cat')};
            else return;

            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ''); // Firefox needs some data attached or the drag won't start. We don't use it.
            if (dragged.type === 'category') e.dataTransfer.setDragImage(dragged.el, 0, 0); // show the whole category

            // Added after a tick, otherwise the faded look would also appear in the drag image.
            setTimeout(() => dragged?.el.classList.add('dragging'), 0);
        });

        // Runs repeatedly while something is dragged over the list: moves it to the spot under the mouse.
        channelList.addEventListener('dragover', e => {
            if (!dragged) return;
            e.preventDefault(); // without this the browser treats the spot as not droppable

            if (dragged.type === 'category') {
                place(channelList, dragged.el, itemAfterMouse(channelList, '.srv-cat', e.clientY));
                return;
            }

            // A channel goes into whichever category the mouse is over, including empty ones.
            const category = e.target.closest('.srv-cat');
            if (!category) return;

            const container = category.querySelector('.srv-cat-channels');
            place(container, dragged.el, itemAfterMouse(container, '.srv-chan-row', e.clientY));
        });

        // Runs when the user drops it: sends the new order to the server and reloads the page if saving fails.
        channelList.addEventListener('dragend', async () => {
            if (!dragged) return;
            dragged.el.classList.remove('dragging');
            dragged = null;

            const layout = JSON.stringify(readLayout());
            if (layout === savedLayout) return; // dropped back where it started

            // The URL comes from a data attribute on #server-list (set in Default.cshtml), because Razor doesn't run in .js files.
            if (await saveOrder(byId('server-list').dataset.reorderChannelsUrl, layout)) savedLayout = layout;
            else saveFailed();
        });
    }

    // ---- Drag and drop reordering of servers ----
    const serverList = byId('server-list');

    if (serverList) {
        let draggedServer = null; // the .srv-item being dragged

        const readServerOrder = () =>
            [...serverList.querySelectorAll('.srv-item')].map(item => Number(item.dataset.serverId));

        let savedServerOrder = JSON.stringify(readServerOrder()); // the order the database has right now

        // Runs when the user starts dragging a server: remembers it and fades it out.
        serverList.addEventListener('dragstart', e => {
            const row = e.target.closest('.srv-row');
            if (!row) return; // channel and category drags are handled by the channel list code above

            draggedServer = row.closest('.srv-item');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', ''); // Firefox needs some data attached or the drag won't start. We don't use it.
            setTimeout(() => draggedServer?.classList.add('dragging'), 0);
        });

        // Runs repeatedly while a server is dragged over the list: moves it to the spot under the mouse.
        serverList.addEventListener('dragover', e => {
            if (!draggedServer) return;
            e.preventDefault(); // without this the browser treats the spot as not droppable

            // The first other server whose row middle is below the mouse. The dragged server goes in front of it.
            // Null means the mouse is below all of them, so it goes last.
            const before = [...serverList.querySelectorAll('.srv-item')]
                .filter(item => item !== draggedServer)
                .find(item => {
                    const box = item.querySelector('.srv-row').getBoundingClientRect();
                    return e.clientY < box.top + box.height / 2;
                }) ?? null;

            if (draggedServer.nextElementSibling !== before) serverList.insertBefore(draggedServer, before);
        });

        // Runs when the user drops it: sends the new order to the server and reloads the page if saving fails.
        serverList.addEventListener('dragend', async () => {
            if (!draggedServer) return;
            draggedServer.classList.remove('dragging');
            draggedServer = null;

            const order = JSON.stringify(readServerOrder());
            if (order === savedServerOrder) return; // dropped back where it started

            if (await saveOrder(serverList.dataset.reorderServersUrl, order)) savedServerOrder = order;
            else saveFailed();
        });
    }
})();