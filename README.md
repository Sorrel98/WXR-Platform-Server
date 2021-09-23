# wxr-library
Repository for the WXR Library Specification. https://wrlab.github.io/wxr-library/

# release note ver 1.4.1
<b>modified feature</b>
<ul>
	<li>AR module reengineering</li>
	<ul>
		<li>Active marker and base marker now exist independently</li>
		<li>The marker component is replaced by the active-marker component and the base-marker component. The a-marker is the primitive with the active-marker as the default component, and the a-base is the primitive with the base-marker as the default component.</li>
	</ul>
</ul>
<b>bug fix</b>
<ul>
	<li>sync component read error(loading & readBatch)</li>
</ul>

# release note ver 1.4.0
<b>added feature</b>
<ul>
	<li>AR module added</li>
	<ul>
		<li>this module is experimental and may not work well</li>
		<li>ios only supported</li>
		<li>MARKER component</li>
		<ul>
			<li>this component recognizes image marker pairs (base markers, active markers) and updates the transform of the camera or element with this component</li>
			<li>this component has 'src' and 'base' property</li>
			<li>the 'src' property is the url of the active marker. the transform of the element with this component will be matched to the active marker.</li>
			<li>the 'base' property is the url of the base marker. when transform the basemarker the system  perceive the camera as moving.</li>
		</ul>
		<li>A-MARKER primitive</li>
		<ul>
			<li>this primitive indicates the image marker</li>
			<li>this has yellow guide box</li>
			<li>when transform the 'a-marker', do it on the local coordinate mode to fit the axes to the image's coordinate system</li>
			<li>this primitive has marker components as default</li>
		</ul>
		<li>TARGET component</li>
		<ul>
			<li>this component has marker property</li>
			<li>the marker property is css selector string for the marker element to reference</li> 
		</ul>
		<li>enter ar mode button</li>
	</ul>
</ul>
<b>modified feature</b>
<ul>
	<li>change the icons set</li>
	<li>sync component</li>
		<ul>
			<li>destroyed the event-driven method</li>
			<li>readBatch method added</li>
			<li>writeBatch method added</li>
			<li>writeObject method added</li>
			<li>writeHierarchyChange method added</li>
			<li>writeComponent method added</li>
			<li>writeTransform method added</li>
		</ul>
</ul>

# release note ver 1.3.10
<b>added feature</b>
<ul>
	<li>UI improvements</li>
 		<ul>
			<li>undo&redo button added</li>
            		<li>snapshot save&load button added</li>
			<li>removeAttribute improvement intuitively</li>
			<li>snapshot load shortcut changed to [ctrl + shift + number]</li>
			<li>insert shortcut added [ctrl + i]</li>
			<li>delete shortcut added [ctrl + d]</li>
			<li>help shortcut added [?]</li>
			<li>translate shortcut changed to t from w</li>
			<li>rotate shortcut changed to r from e</li>
			<li>scale shortcut changed to e from r</li>
			<li>help windows that represent shortcuts added</li>
			<li>help button added</li>
			<li>popup windows can be closed or applied through ESC or Enter key.</li>
		</ul>
</ul>
<b>bug fix</b>
<ul>
	<li>when load a snapshot destroy() not found error about a-asset entity fixed.</li>
	<li>Fixed a bug where children could have mousepicking even if they did not have a collidable property if the parent had a collidable property.</li>
	<li>Fixed a bug where the scale changed to 0.0001 when creating a new element.</li>
</ul>

# release note ver 1.3.9
<b>added feature</b>
<ul>
	<li>UI improvements
		<ul>
			<li>insert button added</li>
			<li>delete button added</li>
			<li>edit button added</li>
            <li>space toggle button added</li>
            <li>mode change groupBox added</li>
		</ul>
	</li>
</ul>
<b>discovered and fixed bug</b>
<ul>
	<li>undo sync miss - Synchronization now works well when an object is revived via undo or redo.</li>
</ul>

# release note ver 1.3.8
<b>added feature</b>
<ul>
	<li>undo - [ctrl + z]</li>
	<li>redo - [ctrl + shift + z]</li>
	<li>twoHandManipulator - In VR Mode, you can control scale or rotation by grabbing the same object with both controllers.</li>
</ul>

# release note ver 1.3.7
<b>bug fix</b>
<ul>
	<li>snapshot load collision</li>
</ul>

# release note ver 1.3.6
<b>added feature</b>
<ul>
	<li>hierarchy change - The hierarchy can be changed by drag and drop on the hierarchy view.</li>
	<li>asseet container - asset container view added. It doesn't synchronization.</li>
</ul>
<b>discovered bug</b>
<ul>
	<li>snapshot load collision - In situations where more than one client is connected, a problem is found in which the elements disappear when the snapshot is loaded.</li>
</ul>

# release note ver 1.3.5
<b>added feature</b>
<ul>
	<li>snapshot - To take a snapshot [shift + 1~9], and To revert a snapshot [alt + 1~9].</li>
</ul>

# release note ver 1.3.4
This is the first release note to include features from previous versions.

<b>main features</b>
<ul>
  <li>synchronization - The sync component can be attached to the a-scene entity. Then the scene will be synchronized except entities that doesn't have id attribute.</li><br>
  
  <li>transform Controls - The td-mode-controls component can be attached to the a-scene entity. The transformControls included in td-mode-controls component can attach to Every element that has object3D through mouse picking. The entity to which tdModeControls is attached can be transformed by manipulating the gizmo.</li><br>
  
  <li>create & delete entity - New entity can be created on runtime and any entity can be deletted too.</li><br>
  
  <li>modificate - Each entity can be changed it's attribute on runtime.</li><br>
  
  <li>added keyboard shortcut
    <ul>
      <li>Q : Togle the cordinate system mode of the transformControls between local and world.</li>
      <li>W : Set the manipulate mode of the transformControls to translate mode.</li>
      <li>E : Set the manipulate mode of the transformControls to rotate mode.</li>
      <li>R : Set the manipulate mode of the transformControls to scale mode.</li>
      <li>+ : Size up the gizmo of the transformControls.</li>
      <li>- : Size down the gizmo of the transformControls.</li>
      <li>x : Togle the visible attribute of x-axis of the gizmo of the transformControls.</li>
      <li>y : Togle the visible attribute of y-axis of the gizmo of the transformControls.</li>
      <li>z : Togle the visible attribute of z-axis of the gizmo of the transformControls.</li>
      <li>space : Togle the activation state of the gizmo of the transformControls.</li>
      <li>esc : Detach the transformControls from the attached object.</li>
      <li>insert : Pop up a window which include a inputbox for id and a combobox for select type of primitive. The new Entity's parent is the selected entity when push the insert key or a-scene when no one is selected.</li>
      <li>delete : Remove the selected entity.</li>
      <li>enter : Pop up a window which include inputboxes for change selected entity's attributes and inputboxes for add or remove a attribute.</li>
    </ul>
  </li><br>
  
  <li>hierarchy view - The hierarchy view is displayed as left fixed window.</li><br>
  
  <li>vr mode controls - This offer laser control interaction on vr mode.</li><br>
  
  <li>point cloud component - This is pcd Loader wraping component.</li><br>
  
  <li>center-shift component - This is a component for change the center of object3D of it's entity.</li><br>
</ul>
